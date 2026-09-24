/**
 * Standalone Worker that runs the monitor checks once a minute, for the
 * Cloudflare Pages deployment (Pages Functions can't have cron triggers).
 * It shares the D1 database with the Pages app.
 *
 * Built and deployed by wrangler with the config generated at build time
 * (see writeCronWorkerConfig in build/cloudflare-config.ts). The Workers and
 * Bun deployments don't use it; they run the Nitro task instead.
 */
import type { D1Database, ExportedHandler } from "@cloudflare/workers-types";
import { DB } from "./db";
import { ConfigHandler } from "./utils/config";
import { Logger } from "./utils/logger";
import { runDueMonitorChecks } from "./utils/monitor-scheduler";

interface Env {
    DB: D1Database;
}

export default {
    async scheduled(_controller, env) {
        // `vars` from the wrangler config reach process.env via nodejs_compat.
        const config = await ConfigHandler.loadConfig();
        Logger.setLogLevel(config.LCCFWSP_LOG_LEVEL ?? "info");

        try {
            DB.instance();
        } catch {
            await DB.init(env.DB, false);
        }

        const { checked } = await runDueMonitorChecks();
        Logger.debug(`Checked ${checked} monitors.`);
    },
} satisfies ExportedHandler<Env>;
