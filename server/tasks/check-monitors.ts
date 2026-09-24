import { defineTask } from "nitropack/runtime";
import { DB } from "../db";
import { Runtime } from "../utils/runtime";
import { ConfigHandler } from "../utils/config";
import { performMonitorCheck } from "../utils/monitor-checker";
import { MonitorStats } from "../utils/monitor-stats";

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

export default defineTask({
    meta: {
        name: "check-monitors",
        description: "Run periodic status checks on all enabled monitors",
    },
    run: async ({ payload, context }) => {
        // Ensure DB is initialized
        try {
            DB.instance();
        } catch {
            // Not initialized (e.g. the cron fired before any request ran the
            // startup plugin) — init from the Cloudflare Workers D1 binding.
            const env = ((context as any)?.cloudflare?.env ?? Runtime.getWorkerBindings()) as { DB?: unknown };
            if (env?.DB) {
                await DB.init(env.DB as any, false);
            } else {
                throw new Error("Database not initialized and no D1 binding available");
            }
        }

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

        return { result: { checked: results.length } };
    },
});
