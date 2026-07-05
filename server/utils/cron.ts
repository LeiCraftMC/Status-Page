/**
 * @deprecated Cron scheduling is now handled by Nitro's built-in task/scheduled task system.
 *
 * See `server/tasks/check-monitors.ts` for the monitor check task.
 * The cron schedule is configured in `nuxt.config.ts` under `nitro.scheduledTasks`.
 *
 * Remove this file once no references to `CronJobHandler` remain.
 */

export class CronJobHandler {

    private static jobs: any[] = [];
    private static initialized: boolean = false;

    static async init() {
        if (this.initialized) return;
        this.initialized = true;

        // No-op: replaced by Nitro tasks
    }

    static async startAll() {
        if (!this.initialized) {
            await this.init();
        }
    }

    static async stopAll() {
        // No-op
    }
}
