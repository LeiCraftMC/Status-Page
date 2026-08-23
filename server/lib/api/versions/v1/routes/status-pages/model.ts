import { createSelectSchema, createUpdateSchema } from "drizzle-zod";
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

export namespace StatusPageAdminModel {

    export const BasePage = createSelectSchema(DB.Tables.statusPageConfig);
    export type BasePage = z.infer<typeof BasePage>;

    export namespace Config {
        export const Body = createUpdateSchema(DB.Tables.statusPageConfig, {
            title: z.string().min(1).max(128).optional(),
            description: z.string().max(4096).optional().nullable(),
            is_public: z.boolean().optional(),
            is_enabled: z.boolean().optional(),
            theme: z.enum(['light', 'dark', 'auto']).optional(),
        }).omit({
            id: true,
            created_at: true,
            updated_at: true,
        }).refine(
            (data) => Object.values(data).some((value) => value !== undefined),
            { message: "At least one field must be provided" }
        );
        export type Body = z.infer<typeof Body>;

        export const Response = BasePage;
        export type Response = z.infer<typeof Response>;
    }

    export const BaseGroup = createSelectSchema(DB.Tables.monitorGroups);
    export type BaseGroup = z.infer<typeof BaseGroup>;

    export namespace CreateGroup {
        export const Body = z.object({
            name: z.string().min(1).max(128),
            sort_order: z.number().int().default(0),
        });
        export type Body = z.infer<typeof Body>;

        export const Response = BaseGroup;
        export type Response = z.infer<typeof Response>;
    }

    export namespace UpdateGroup {
        export const Body = z.object({
            name: z.string().min(1).max(128).optional(),
            sort_order: z.number().int().optional(),
        }).refine(
            (data) => Object.values(data).some((value) => value !== undefined),
            { message: "At least one field must be provided" }
        );
        export type Body = z.infer<typeof Body>;

        export const Response = BaseGroup;
        export type Response = z.infer<typeof Response>;
    }

    export namespace GroupId {
        export const Params = z.object({
            groupId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;
    }

    export const BaseLink = createSelectSchema(DB.Tables.monitorGroupAssignments);
    export type BaseLink = z.infer<typeof BaseLink>;

    export namespace CreateLink {
        export const Body = z.object({
            monitor_id: z.number().int().positive(),
            group_id: z.number().int().positive().optional().nullable(),
            display_name: z.string().min(1).max(128).optional().nullable(),
            sort_order: z.number().int().default(0),
        });
        export type Body = z.infer<typeof Body>;

        export const Response = BaseLink;
        export type Response = z.infer<typeof Response>;
    }

    export namespace UpdateLink {
        export const Body = z.object({
            group_id: z.number().int().positive().optional().nullable(),
            display_name: z.string().min(1).max(128).optional().nullable(),
            sort_order: z.number().int().optional(),
        }).refine(
            (data) => Object.values(data).some((value) => value !== undefined),
            { message: "At least one field must be provided" }
        );
        export type Body = z.infer<typeof Body>;

        export const Response = BaseLink;
        export type Response = z.infer<typeof Response>;
    }

    export namespace LinkId {
        export const Params = z.object({
            linkId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;
    }

    export namespace FullPage {
        export const Response = z.object({
            config: BasePage,
            groups: z.array(BaseGroup),
            links: z.array(BaseLink.extend({
                monitor_name: z.string(),
            })),
        });
        export type Response = z.infer<typeof Response>;
    }
}
