import { defineTask } from "nitropack/runtime";
import { eq, desc } from "drizzle-orm";
import { DB } from "../db";
import { performMonitorCheck } from "../utils/monitor-checker";

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
            // Not initialized — try to init from Cloudflare Workers env binding
            const env = (globalThis as any).__env__;
            if (env?.DB) {
                await DB.init(env.DB, false);
            } else {
                throw new Error("Database not initialized and no D1 binding available");
            }
        }

        const db = DB.instance();
        const now = Date.now();

        // Get all enabled monitors
        const monitors = await db.select().from(DB.Tables.monitors)
            .where(eq(DB.Tables.monitors.is_enabled, true));

        let checkedCount = 0;

        for (const monitor of monitors) {
            const intervalMs = (monitor.interval_seconds ?? 60) * 1000;

            // Get the latest check timestamp for this monitor
            const lastCheck = await db.select()
                .from(DB.Tables.monitorStatusChecks)
                .where(eq(DB.Tables.monitorStatusChecks.monitor_id, monitor.id))
                .orderBy(desc(DB.Tables.monitorStatusChecks.checked_at))
                .get();

            const lastCheckTime = lastCheck?.checked_at ?? 0;

            // Only check if enough time has passed since the last check
            if (now - lastCheckTime >= intervalMs) {
                const result = await performMonitorCheck(monitor as any);
                await db.insert(DB.Tables.monitorStatusChecks).values({
                    monitor_id: monitor.id,
                    status: result.status,
                    response_time_ms: result.response_time_ms,
                }).run();
                checkedCount++;
            }
        }

        return { result: { checked: checkedCount } };
    },
});
