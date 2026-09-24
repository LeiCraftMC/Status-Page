import { describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { DB } from "../server/db";
import { MonitorStats } from "../server/utils/monitor-stats";
import { buildMonitorHistory, buildSingleMonitorHistory } from "../server/lib/api/versions/v1/routes/status-pages/helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

async function createMonitor(name: string) {
    return await DB.instance().insert(DB.Tables.monitors).values({
        name,
        type: "http",
        target: "https://example.com",
        http_method: "GET",
    }).returning().get();
}

async function statsFor(monitorId: number) {
    return await DB.instance().select().from(DB.Tables.monitorDailyStats)
        .where(eq(DB.Tables.monitorDailyStats.monitor_id, monitorId));
}

describe("MonitorStats.recordChecks", () => {

    test("stores raw checks and folds them into one row per day", async () => {
        const monitor = await createMonitor("stats-aggregate");
        const today = Date.now();
        const yesterday = today - DAY_MS;

        const inserted = await MonitorStats.recordChecks([
            { monitor_id: monitor.id, status: "up", response_time_ms: 40, checked_at: today },
            { monitor_id: monitor.id, status: "up", response_time_ms: 120, checked_at: today },
            { monitor_id: monitor.id, status: "down", response_time_ms: null, checked_at: today },
            { monitor_id: monitor.id, status: "up", response_time_ms: 900, checked_at: yesterday },
        ]);
        expect(inserted).toHaveLength(4);

        const rows = await statsFor(monitor.id);
        expect(rows).toHaveLength(2);

        const todayRow = rows.find((r) => r.day === MonitorStats.dayKey(today))!;
        expect(todayRow.up_count).toBe(2);
        expect(todayRow.down_count).toBe(1);
        expect(todayRow.response_time_count).toBe(2);
        expect(todayRow.response_time_sum).toBe(160);
        expect(todayRow.response_time_min).toBe(40);
        expect(todayRow.response_time_max).toBe(120);
        expect(todayRow.latency_bucket_0).toBe(1); // <= 50 ms
        expect(todayRow.latency_bucket_2).toBe(1); // <= 150 ms

        const yesterdayRow = rows.find((r) => r.day === MonitorStats.dayKey(yesterday))!;
        expect(yesterdayRow.up_count).toBe(1);
        expect(yesterdayRow.latency_bucket_7).toBe(1); // <= 1000 ms
    });

    test("adds to an existing day instead of overwriting it, also when recording concurrently", async () => {
        const monitor = await createMonitor("stats-increment");
        const now = Date.now();

        await MonitorStats.recordChecks([{ monitor_id: monitor.id, status: "up", response_time_ms: 200, checked_at: now }]);
        await Promise.all([
            MonitorStats.recordChecks([{ monitor_id: monitor.id, status: "up", response_time_ms: 10, checked_at: now }]),
            MonitorStats.recordChecks([{ monitor_id: monitor.id, status: "degraded", response_time_ms: 3000, checked_at: now }]),
            MonitorStats.recordChecks([{ monitor_id: monitor.id, status: "unknown", response_time_ms: null, checked_at: now }]),
        ]);

        const [row] = await statsFor(monitor.id);
        expect(row!.up_count).toBe(2);
        expect(row!.degraded_count).toBe(1);
        expect(row!.unknown_count).toBe(1);
        expect(row!.response_time_count).toBe(3);
        expect(row!.response_time_sum).toBe(3210);
        expect(row!.response_time_min).toBe(10);
        expect(row!.response_time_max).toBe(3000);
    });

    test("getLatestChecks returns the newest check per monitor", async () => {
        const a = await createMonitor("stats-latest-a");
        const b = await createMonitor("stats-latest-b");
        const now = Date.now();

        await MonitorStats.recordChecks([
            { monitor_id: a.id, status: "down", response_time_ms: 5, checked_at: now - 120_000 },
            { monitor_id: a.id, status: "up", response_time_ms: 7, checked_at: now - 60_000 },
            { monitor_id: b.id, status: "degraded", response_time_ms: 9, checked_at: now - 30_000 },
        ]);

        const latest = await MonitorStats.getLatestChecks([a.id, b.id, 999_999]);
        expect(latest.get(a.id)?.status).toBe("up");
        expect(latest.get(b.id)?.status).toBe("degraded");
        expect(latest.has(999_999)).toBe(false);
    });
});

describe("MonitorStats.latencySummary", () => {

    test("estimates the percentile from the histogram, clamped to min/max", async () => {
        const monitor = await createMonitor("stats-latency");
        const now = Date.now();
        // 94 fast checks and 6 slow ones: p95 lands in the slow bucket.
        const checks = [
            ...Array.from({ length: 94 }, () => ({ monitor_id: monitor.id, status: "up" as const, response_time_ms: 30, checked_at: now })),
            ...Array.from({ length: 6 }, () => ({ monitor_id: monitor.id, status: "up" as const, response_time_ms: 1800, checked_at: now })),
        ];
        await MonitorStats.recordChecks(checks);

        const summary = MonitorStats.latencySummary(await statsFor(monitor.id), 0.95);
        expect(summary.min).toBe(30);
        expect(summary.max).toBe(1800);
        expect(summary.avg).toBe(Math.round((94 * 30 + 6 * 1800) / 100));
        // Bucket upper bound is 2000 ms, clamped to the observed max.
        expect(summary.percentile).toBe(1800);
    });

    test("returns nulls without response times", () => {
        expect(MonitorStats.latencySummary([])).toEqual({ avg: null, min: null, max: null, percentile: null });
    });
});

describe("history builders", () => {

    test("uptime history matches the recorded checks", async () => {
        const monitor = await createMonitor("stats-history");
        const now = Date.now();

        await MonitorStats.recordChecks([
            { monitor_id: monitor.id, status: "up", response_time_ms: 100, checked_at: now },
            { monitor_id: monitor.id, status: "up", response_time_ms: 100, checked_at: now },
            { monitor_id: monitor.id, status: "up", response_time_ms: 100, checked_at: now },
            { monitor_id: monitor.id, status: "down", response_time_ms: null, checked_at: now },
            { monitor_id: monitor.id, status: "unknown", response_time_ms: null, checked_at: now - DAY_MS },
        ]);

        const history = await buildMonitorHistory(7, [{ id: monitor.id, name: monitor.name, display_name: null, group_id: null }]);
        const buckets = history.monitors[0]!.buckets;

        expect(buckets).toHaveLength(7);
        expect(history.end_date).toBe(MonitorStats.dayKey(now));

        const today = buckets[6]!;
        expect(today.status).toBe("down");
        expect(today.total_checks).toBe(4);
        expect(today.uptime_percentage).toBe(75);

        const yesterday = buckets[5]!;
        expect(yesterday.status).toBe("unknown");
        expect(yesterday.total_checks).toBe(1);

        expect(buckets[0]!.total_checks).toBe(0);
        expect(buckets[0]!.status).toBe("unknown");
        expect(history.monitors[0]!.uptime_percentage).toBe(75);
    });

    test("single monitor history reports latency and recent checks", async () => {
        const monitor = await createMonitor("stats-single-history");
        const now = Date.now();

        await MonitorStats.recordChecks([
            { monitor_id: monitor.id, status: "up", response_time_ms: 80, checked_at: now - 2000 },
            { monitor_id: monitor.id, status: "up", response_time_ms: 120, checked_at: now - 1000 },
        ]);

        const history = await buildSingleMonitorHistory(30, monitor);
        expect(history.total_checks).toBe(2);
        expect(history.uptime_percentage).toBe(100);
        expect(history.latency.avg_response_time_ms).toBe(100);
        expect(history.latency.min_response_time_ms).toBe(80);
        expect(history.latency.max_response_time_ms).toBe(120);
        expect(history.buckets[29]!.avg_response_time_ms).toBe(100);
        expect(history.recent_checks.map((c) => c.response_time_ms)).toEqual([120, 80]);
    });
});

describe("maintenance", () => {

    test("pruneRawChecks deletes only old raw checks and keeps the aggregates", async () => {
        const monitor = await createMonitor("stats-prune");
        const now = Date.now();

        await MonitorStats.recordChecks([
            { monitor_id: monitor.id, status: "up", response_time_ms: 50, checked_at: now - 10 * DAY_MS },
            { monitor_id: monitor.id, status: "up", response_time_ms: 50, checked_at: now },
        ]);

        await MonitorStats.pruneRawChecks([monitor.id], 7);

        const raw = await DB.instance().select().from(DB.Tables.monitorStatusChecks)
            .where(eq(DB.Tables.monitorStatusChecks.monitor_id, monitor.id));
        expect(raw).toHaveLength(1);
        expect(await statsFor(monitor.id)).toHaveLength(2);
    });

    test("backfillDailyStatsIfEmpty rebuilds the aggregates from raw checks", async () => {
        const monitor = await createMonitor("stats-backfill");
        const now = Date.now();

        await MonitorStats.recordChecks([
            { monitor_id: monitor.id, status: "up", response_time_ms: 60, checked_at: now },
            { monitor_id: monitor.id, status: "down", response_time_ms: null, checked_at: now - DAY_MS },
        ]);
        const before = await DB.instance().select().from(DB.Tables.monitorDailyStats);

        // Simulate an installation upgraded from a version without aggregates.
        await DB.instance().delete(DB.Tables.monitorDailyStats);
        expect(await MonitorStats.backfillDailyStatsIfEmpty()).toBeGreaterThan(0);

        const after = await DB.instance().select().from(DB.Tables.monitorDailyStats);
        // Other monitors' aggregates may legitimately differ from their raw
        // checks (e.g. after pruning), so compare this monitor only.
        const strip = (rows: typeof before) => rows
            .filter((row) => row.monitor_id === monitor.id)
            .map(({ id, ...rest }) => rest)
            .sort((a, b) => `${a.monitor_id}|${a.day}`.localeCompare(`${b.monitor_id}|${b.day}`));
        expect(strip(after)).toEqual(strip(before));

        // Already populated: nothing to do.
        expect(await MonitorStats.backfillDailyStatsIfEmpty()).toBe(0);
    });
});
