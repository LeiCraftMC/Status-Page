import { createSelectSchema } from "drizzle-zod";
import { DB } from "../../../../../../db";
import z from "zod";

export namespace StatusPagesReadModel {

    export const BasePage = createSelectSchema(DB.Tables.statusPages);
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

    export namespace GetAll {
        export const Response = z.array(BasePage);
        export type Response = z.infer<typeof Response>;
    }

    export namespace GetBySlug {
        export const Params = z.object({
            slug: z.string().min(1),
        });
        export type Params = z.infer<typeof Params>;

        export const Response = z.object({
            page: BasePage,
            groups: z.array(GroupSummary),
            ungrouped: z.array(MonitorSummary),
        });
        export type Response = z.infer<typeof Response>;
    }

    export namespace FullPage {
        export const Response = GetBySlug.Response;
        export type Response = z.infer<typeof Response>;
    }

    export namespace GetRoot {
        export const Response = GetBySlug.Response;
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
