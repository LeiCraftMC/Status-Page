import { DB } from "../db";
import { ConfigHandler } from "./config";
import { MonitorStats } from "./monitor-stats";
import { MonitorTypes } from "./monitor-types";

/**
 * Runs the periodic monitor checks. Called once a minute — by the Nitro
 * scheduled task (Bun, Workers) or by the separate cron Worker (Pages).
 */
export class MonitorScheduler {

    protected constructor() {}

    /**
     * Cloudflare Workers allow six connections waiting for a response at a time
     * per invocation; running more checks at once would just queue them.
     */
    static readonly MAX_PARALLEL_CHECKS = 6;

    static readonly DEFAULT_INTERVAL_SECONDS = 60;

    /**
     * Checks every enabled, unpaused monitor whose interval has elapsed, records
     * the results and prunes old raw checks.
     *
     * Expects the database to be initialized.
     */
    static async runDueChecks(): Promise<{ checked: number }> {
        const config = await ConfigHandler.loadConfig();

        const allMonitors = await DB.instance().select().from(DB.Tables.monitors);
        const due = await this.getDueMonitors(allMonitors, Date.now());

        const results = await this.mapWithConcurrency(due, this.MAX_PARALLEL_CHECKS, async (monitor) => ({
            monitor_id: monitor.id,
            ...await MonitorTypes.check(monitor),
        }));

        await MonitorStats.recordChecks(results);

        const retentionDays = ConfigHandler.getCheckRetentionDays(config);
        if (retentionDays > 0 && allMonitors.length > 0) {
            await MonitorStats.pruneRawChecks(allMonitors.map((monitor) => monitor.id), retentionDays);
        }

        return { checked: results.length };
    }

    /** Enabled, unpaused monitors whose last check is at least one interval ago. */
    private static async getDueMonitors(monitors: DB.Models.Monitor[], now: number): Promise<DB.Models.Monitor[]> {
        // Paused monitors keep their history but are not checked.
        const active = monitors.filter((monitor) => monitor.is_enabled && !monitor.is_paused);

        const latest = await MonitorStats.getLatestChecks(active.map((monitor) => monitor.id));
        return active.filter((monitor) => {
            const intervalMs = (monitor.interval_seconds ?? this.DEFAULT_INTERVAL_SECONDS) * 1000;
            return now - (latest.get(monitor.id)?.checked_at ?? 0) >= intervalMs;
        });
    }

    /** Like `Promise.all(items.map(fn))`, with at most `limit` calls running at once. */
    private static async mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
        const results: R[] = new Array(items.length);
        let next = 0;
        const worker = async () => {
            while (next < items.length) {
                const index = next++;
                results[index] = await fn(items[index]!);
            }
        };
        await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
        return results;
    }

}
