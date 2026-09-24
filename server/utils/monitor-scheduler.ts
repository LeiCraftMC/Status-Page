import { DB } from "../db";
import { ConfigHandler } from "./config";
import { performMonitorCheck } from "./monitor-checker";
import { MonitorStats } from "./monitor-stats";

/**
 * Cloudflare Workers allow six connections waiting for a response at a time
 * per invocation; running more checks at once would just queue them.
 */
const MAX_PARALLEL_CHECKS = 6;

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const index = next++;
            results[index] = await fn(items[index]!);
        }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

/**
 * Checks every enabled, unpaused monitor whose interval has elapsed, records
 * the results and prunes old raw checks. Called once a minute — by the Nitro
 * scheduled task (Bun, Workers) or by the separate cron Worker (Pages).
 *
 * Expects the database to be initialized.
 */
export async function runDueMonitorChecks(): Promise<{ checked: number }> {
    const config = await ConfigHandler.loadConfig();
    const now = Date.now();

    const allMonitors = await DB.instance().select().from(DB.Tables.monitors);
    // Paused monitors keep their history but are not checked.
    const active = allMonitors.filter((monitor) => monitor.is_enabled && !monitor.is_paused);

    const latest = await MonitorStats.getLatestChecks(active.map((monitor) => monitor.id));
    const due = active.filter((monitor) => {
        const intervalMs = (monitor.interval_seconds ?? 60) * 1000;
        return now - (latest.get(monitor.id)?.checked_at ?? 0) >= intervalMs;
    });

    const results = await mapWithConcurrency(due, MAX_PARALLEL_CHECKS, async (monitor) => ({
        monitor_id: monitor.id,
        ...await performMonitorCheck(monitor),
    }));

    await MonitorStats.recordChecks(results);

    const retentionDays = ConfigHandler.getCheckRetentionDays(config);
    if (retentionDays > 0 && allMonitors.length > 0) {
        await MonitorStats.pruneRawChecks(allMonitors.map((monitor) => monitor.id), retentionDays);
    }

    return { checked: results.length };
}
