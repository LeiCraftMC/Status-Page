import { createSelectSchema } from "drizzle-zod";
import { DB } from "../../../../../../db";
import z from "zod";

export namespace MonitorsReadModel {

    export const MonitorWithStatus = createSelectSchema(DB.Tables.monitors).omit({}).extend({
        latest_check: z.object({
            status: z.enum(['up', 'down', 'degraded', 'unknown']),
            response_time_ms: z.number().nullable(),
            checked_at: z.number().nullable(),
        }).nullable(),
    });
    export type MonitorWithStatus = z.infer<typeof MonitorWithStatus>;

    export namespace GetAll {
        export const Response = z.array(MonitorWithStatus);
        export type Response = z.infer<typeof Response>;
    }

    export namespace GetOne {
        export const Params = z.object({
            monitorId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;

        export const Response = MonitorWithStatus.extend({
            recent_checks: z.array(createSelectSchema(DB.Tables.monitorStatusChecks)),
        });
        export type Response = z.infer<typeof Response>;
    }
}
