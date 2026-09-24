import { and, asc, desc, eq, gt, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { DB } from "../db";

/**
 * Recording and reading monitor status checks.
 *
 * Every check is stored twice: as a raw row in `monitor_status_checks` (used
 * for "latest" and "recent checks") and folded into its day's aggregate in
 * `monitor_daily_stats` (used for uptime history and latency statistics).
 * Reading the aggregates keeps history requests cheap no matter how many raw
 * checks exist — which matters for D1's per-query row limits and the CPU
 * budget on Cloudflare Workers.
 *
 * All writes of status checks must go through {@link MonitorStats.recordChecks}
 * so the aggregates stay in sync.
 */
export namespace MonitorStats {

    export type Status = DB.Models.MonitorStatusCheck["status"];

    export interface NewCheck {
        monitor_id: number;
        status: Status;
        response_time_ms: number | null;
        /** Defaults to now. */
        checked_at?: number;
    }

    /**
     * Upper bounds (inclusive, in ms) of the latency histogram buckets stored in
     * `monitor_daily_stats.latency_bucket_*`. There is one more bucket than
     * bounds: the last one counts everything slower than the last bound.
     */
    export const LATENCY_BUCKET_BOUNDS_MS = [50, 100, 150, 200, 300, 500, 750, 1000, 2000, 5000, 10000] as const;

    const table = DB.Tables.monitorDailyStats;
    const checksTable = DB.Tables.monitorStatusChecks;

    const LATENCY_BUCKET_COLUMNS = [
        "latency_bucket_0", "latency_bucket_1", "latency_bucket_2", "latency_bucket_3",
        "latency_bucket_4", "latency_bucket_5", "latency_bucket_6", "latency_bucket_7",
        "latency_bucket_8", "latency_bucket_9", "latency_bucket_10", "latency_bucket_11",
    ] as const satisfies readonly (keyof DB.Models.MonitorDailyStats)[];

    type LatencyBucketColumn = typeof LATENCY_BUCKET_COLUMNS[number];

    const STATUS_COUNT_COLUMNS = {
        up: "up_count",
        down: "down_count",
        degraded: "degraded_count",
        unknown: "unknown_count",
    } as const satisfies Record<Status, keyof DB.Models.MonitorDailyStats>;

    // Worst first: a day's status is the worst status seen that day.
    const STATUS_SEVERITY: readonly Status[] = ["down", "degraded", "unknown", "up"];

    function chunk<T>(items: T[], size: number): T[][] {
        const parts: T[][] = [];
        for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
        return parts;
    }

    /** Narrows an array the caller knows to be non-empty to the tuple type `DB.batch()` expects. */
    function nonEmpty<T>(items: T[]): [T, ...T[]] {
        if (items.length === 0) throw new Error("Expected at least one query");
        return items as [T, ...T[]];
    }

    /** UTC calendar day of a timestamp, formatted YYYY-MM-DD. */
    export function dayKey(timestamp: number): string {
        return new Date(timestamp).toISOString().slice(0, 10);
    }

    function latencyBucketIndex(responseTimeMs: number): number {
        const index = LATENCY_BUCKET_BOUNDS_MS.findIndex((bound) => responseTimeMs <= bound);
        return index === -1 ? LATENCY_BUCKET_BOUNDS_MS.length : index;
    }

    type DailyStatsInsert = typeof table.$inferInsert;

    /** Folds checks into one aggregate row per (monitor, day). */
    function aggregateByDay(checks: Required<NewCheck>[]): DailyStatsInsert[] {
        const rows = new Map<string, DailyStatsInsert & Record<LatencyBucketColumn, number>>();

        for (const check of checks) {
            const day = dayKey(check.checked_at);
            const key = `${check.monitor_id}|${day}`;

            let row = rows.get(key);
            if (!row) {
                row = {
                    monitor_id: check.monitor_id,
                    day,
                    up_count: 0,
                    down_count: 0,
                    degraded_count: 0,
                    unknown_count: 0,
                    response_time_count: 0,
                    response_time_sum: 0,
                    response_time_min: null,
                    response_time_max: null,
                    ...Object.fromEntries(LATENCY_BUCKET_COLUMNS.map((column) => [column, 0])) as Record<LatencyBucketColumn, number>,
                };
                rows.set(key, row);
            }

            const statusColumn = STATUS_COUNT_COLUMNS[check.status];
            row[statusColumn] = (row[statusColumn] ?? 0) + 1;

            const responseTime = check.response_time_ms;
            if (responseTime != null) {
                row.response_time_count = (row.response_time_count ?? 0) + 1;
                row.response_time_sum = (row.response_time_sum ?? 0) + responseTime;
                row.response_time_min = row.response_time_min == null ? responseTime : Math.min(row.response_time_min, responseTime);
                row.response_time_max = row.response_time_max == null ? responseTime : Math.max(row.response_time_max, responseTime);
                row[LATENCY_BUCKET_COLUMNS[latencyBucketIndex(responseTime)]!] += 1;
            }
        }

        return [...rows.values()];
    }

    /** `excluded.<column>`: the value the conflicting INSERT tried to write. */
    function excluded(column: SQLiteColumn) {
        return sql`excluded.${sql.identifier(column.name)}`;
    }

    function addExcluded(column: SQLiteColumn) {
        return sql`${column} + ${excluded(column)}`;
    }

    /**
     * Upsert that adds one day's aggregate to the stored one. The additions
     * happen inside the statement, so concurrent recorders (the cron and a
     * manual check) cannot lose each other's updates.
     *
     * One row per statement: D1 allows at most 100 bound parameters per
     * statement and a row has 22 columns.
     */
    function upsertDailyStats(row: DailyStatsInsert) {
        return DB.instance()
            .insert(table)
            .values(row)
            .onConflictDoUpdate({
                target: [table.monitor_id, table.day],
                set: {
                    up_count: addExcluded(table.up_count),
                    down_count: addExcluded(table.down_count),
                    degraded_count: addExcluded(table.degraded_count),
                    unknown_count: addExcluded(table.unknown_count),
                    response_time_count: addExcluded(table.response_time_count),
                    response_time_sum: addExcluded(table.response_time_sum),
                    // min()/max() with several arguments are SQLite's scalar
                    // functions; coalesce() makes a NULL on either side lose.
                    response_time_min: sql`min(coalesce(${table.response_time_min}, ${excluded(table.response_time_min)}), coalesce(${excluded(table.response_time_min)}, ${table.response_time_min}))`,
                    response_time_max: sql`max(coalesce(${table.response_time_max}, ${excluded(table.response_time_max)}), coalesce(${excluded(table.response_time_max)}, ${table.response_time_max}))`,
                    ...Object.fromEntries(LATENCY_BUCKET_COLUMNS.map((column) => [column, addExcluded(table[column])])),
                },
            });
    }

    /** Raw check rows per INSERT (4 parameters each, D1 allows 100 per statement). */
    const RAW_INSERT_CHUNK = 20;

    /**
     * Stores checks and updates their daily aggregates in one database
     * round-trip. Returns the stored raw check rows.
     */
    export async function recordChecks(checks: NewCheck[]): Promise<DB.Models.MonitorStatusCheck[]> {
        if (checks.length === 0) return [];

        const now = Date.now();
        const rows: Required<NewCheck>[] = checks.map((check) => ({
            ...check,
            checked_at: check.checked_at ?? now,
        }));

        const inserts = chunk(rows, RAW_INSERT_CHUNK).map((part) =>
            DB.instance().insert(checksTable).values(part).returning()
        );
        const upserts = aggregateByDay(rows).map(upsertDailyStats);

        const results = await DB.batch(nonEmpty([...inserts, ...upserts]));
        return (results.slice(0, inserts.length) as DB.Models.MonitorStatusCheck[][]).flat();
    }

    /**
     * Latest check for each of the given monitors. Each lookup is a single
     * index seek; all of them run in one round-trip.
     */
    export async function getLatestChecks(monitorIds: number[]): Promise<Map<number, DB.Models.MonitorStatusCheck>> {
        const latest = new Map<number, DB.Models.MonitorStatusCheck>();
        const ids = [...new Set(monitorIds)];
        if (ids.length === 0) return latest;

        const lookups = ids.map((id) => DB.instance()
            .select()
            .from(checksTable)
            .where(eq(checksTable.monitor_id, id))
            .orderBy(desc(checksTable.checked_at))
            .limit(1));

        const results = await DB.batch(nonEmpty(lookups));
        for (const [check] of results) {
            if (check) latest.set(check.monitor_id, check);
        }
        return latest;
    }

    /** Most recent raw checks of one monitor, newest first. */
    export async function getRecentChecks(monitorId: number, limit: number) {
        return await DB.instance()
            .select()
            .from(checksTable)
            .where(eq(checksTable.monitor_id, monitorId))
            .orderBy(desc(checksTable.checked_at))
            .limit(limit);
    }

    /** Daily aggregates of the given monitors for the inclusive day range. */
    export async function getDailyStats(monitorIds: number[], startDay: string, endDay: string) {
        if (monitorIds.length === 0) return [];
        return await DB.instance()
            .select()
            .from(table)
            .where(and(
                inArray(table.monitor_id, monitorIds),
                gte(table.day, startDay),
                lte(table.day, endDay),
            ));
    }

    export function totalChecks(stats: DB.Models.MonitorDailyStats): number {
        return stats.up_count + stats.down_count + stats.degraded_count + stats.unknown_count;
    }

    /** Checks with a definite result (everything except `unknown`). */
    export function knownChecks(stats: DB.Models.MonitorDailyStats): number {
        return stats.up_count + stats.down_count + stats.degraded_count;
    }

    /** Worst status seen that day, or `unknown` when nothing was checked. */
    export function worstStatus(stats: DB.Models.MonitorDailyStats | undefined): Status {
        if (!stats) return "unknown";
        return STATUS_SEVERITY.find((status) => stats[STATUS_COUNT_COLUMNS[status]] > 0) ?? "unknown";
    }

    /** Uptime in percent with one decimal, 0 when there were no known checks. */
    export function uptimePercentage(up: number, known: number): number {
        return known > 0 ? Math.round((up / known) * 1000) / 10 : 0;
    }

    /**
     * Latency statistics over several days of aggregates. The percentile is
     * estimated from the histogram: it is the upper bound of the bucket that
     * contains it, clamped to the observed min/max.
     */
    export function latencySummary(days: DB.Models.MonitorDailyStats[], percentile = 0.95) {
        let count = 0;
        let sum = 0;
        let min: number | null = null;
        let max: number | null = null;
        const histogram: number[] = LATENCY_BUCKET_COLUMNS.map(() => 0);

        for (const day of days) {
            count += day.response_time_count;
            sum += day.response_time_sum;
            if (day.response_time_min != null) min = min == null ? day.response_time_min : Math.min(min, day.response_time_min);
            if (day.response_time_max != null) max = max == null ? day.response_time_max : Math.max(max, day.response_time_max);
            LATENCY_BUCKET_COLUMNS.forEach((column, i) => { histogram[i]! += day[column]; });
        }

        let estimated: number | null = null;
        if (count > 0 && min != null && max != null) {
            const rank = Math.ceil(count * percentile);
            let cumulative = 0;
            const bucket = histogram.findIndex((n) => (cumulative += n) >= rank);
            const upperBound = LATENCY_BUCKET_BOUNDS_MS[bucket] ?? max;
            estimated = Math.min(Math.max(upperBound, min), max);
        }

        return {
            avg: count > 0 ? Math.round(sum / count) : null,
            min,
            max,
            percentile: estimated,
        };
    }

    /**
     * Deletes raw checks older than `retentionDays`. The daily aggregates are
     * kept, so uptime history and latency statistics are unaffected.
     */
    export function pruneRawChecks(monitorIds: number[], retentionDays: number) {
        const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
        return DB.instance()
            .delete(checksTable)
            .where(and(
                inArray(checksTable.monitor_id, monitorIds),
                lt(checksTable.checked_at, cutoff),
            ));
    }

    /**
     * Builds the daily aggregates from existing raw checks. Runs once, when the
     * aggregate table is still empty (i.e. right after upgrading an existing
     * installation); new checks are aggregated as they are recorded.
     */
    export async function backfillDailyStatsIfEmpty(): Promise<number> {
        const hasStats = await DB.instance().select({ id: table.id }).from(table).limit(1).get();
        if (hasStats) return 0;

        const PAGE_SIZE = 5000;
        let lastId = 0;
        let processed = 0;

        while (true) {
            const page = await DB.instance()
                .select()
                .from(checksTable)
                .where(gt(checksTable.id, lastId))
                .orderBy(asc(checksTable.id))
                .limit(PAGE_SIZE);
            if (page.length === 0) break;

            for (const row of aggregateByDay(page)) {
                await upsertDailyStats(row);
            }

            processed += page.length;
            lastId = page[page.length - 1]!.id;
        }

        return processed;
    }

}
