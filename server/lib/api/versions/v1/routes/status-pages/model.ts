import { createSelectSchema } from "drizzle-zod";
import { DB } from "../../../../../../db";
import z from "zod";

export namespace StatusPagesReadModel {

    export const BasePage = createSelectSchema(DB.Tables.statusPageConfig);
    export type BasePage = z.infer<typeof BasePage>;

    export const MonitorSummary = z.object({
        id: z.number(),
        name: z.string(),
        type: z.enum(['http', 'tcp']),
        target: z.string(),
        display_name: z.string().nullable(),
        sort_order: z.number(),
        latest_check: z.object({
            status: z.enum(['up', 'down', 'degraded', 'unknown']),
            response_time_ms: z.number().nullable(),
            checked_at: z.number().nullable(),
        }).nullable(),
    });
    export type MonitorSummary = z.infer<typeof MonitorSummary>;

    export const GroupSummary = z.object({
        id: z.number(),
        name: z.string(),
        sort_order: z.number(),
        monitors: z.array(MonitorSummary),
    });
    export type GroupSummary = z.infer<typeof GroupSummary>;

    export namespace GetPage {
        export const Response = z.object({
            page: BasePage,
            groups: z.array(GroupSummary),
            ungrouped: z.array(MonitorSummary),
            incidents: z.array(createSelectSchema(DB.Tables.incidents)),
            maintenance: z.array(createSelectSchema(DB.Tables.maintenance)),
            updates: z.array(createSelectSchema(DB.Tables.statusUpdates)),
        });
        export type Response = z.infer<typeof Response>;
    }

    export namespace GetPublicMonitor {
        export const Params = z.object({
            monitorId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;

        export const Response = z.object({
            monitor: createSelectSchema(DB.Tables.monitors),
            latest_check: createSelectSchema(DB.Tables.monitorStatusChecks).nullable(),
        });
        export type Response = z.infer<typeof Response>;
    }
}
