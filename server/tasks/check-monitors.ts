import { defineTask } from "nitropack/runtime";
import { DB } from "../db";
import { Runtime } from "../utils/runtime";
import { MonitorScheduler } from "../utils/monitor-scheduler";

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

        return { result: await MonitorScheduler.runDueChecks() };
    },
});
