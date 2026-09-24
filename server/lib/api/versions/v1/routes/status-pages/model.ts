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
        is_paused: z.boolean(),
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

    export const IncidentWithUpdates = createSelectSchema(DB.Tables.incidents).extend({
        updates: z.array(createSelectSchema(DB.Tables.statusUpdates)),
    });
    export type IncidentWithUpdates = z.infer<typeof IncidentWithUpdates>;

    export const MaintenanceWithUpdates = createSelectSchema(DB.Tables.maintenance).extend({
        updates: z.array(createSelectSchema(DB.Tables.statusUpdates)),
    });
    export type MaintenanceWithUpdates = z.infer<typeof MaintenanceWithUpdates>;

    export namespace GetPage {
        export const Response = z.object({
            page: BasePage,
            groups: z.array(GroupSummary),
            ungrouped: z.array(MonitorSummary),
            incidents: z.array(IncidentWithUpdates),
            maintenance: z.array(MaintenanceWithUpdates),
        });
        export type Response = z.infer<typeof Response>;
    }

    export namespace GetPublicIncident {
        export const Params = z.object({
            incidentId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;

        export const Response = z.object({
            incident: IncidentWithUpdates,
        });
        export type Response = z.infer<typeof Response>;
    }

    export namespace GetPublicMaintenance {
        export const Params = z.object({
            maintenanceId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;

        export const Response = z.object({
            maintenance: MaintenanceWithUpdates,
        });
        export type Response = z.infer<typeof Response>;
    }

    export const HistoryStatus = z.enum(['up', 'down', 'degraded', 'unknown']);
    export type HistoryStatus = z.infer<typeof HistoryStatus>;

    export namespace GetPublicMonitor {
        export const Params = z.object({
            monitorId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;

        export const Response = z.object({
            monitor: createSelectSchema(DB.Tables.monitors),
            display_name: z.string().nullable(),
            latest_check: createSelectSchema(DB.Tables.monitorStatusChecks).nullable(),
        });
        export type Response = z.infer<typeof Response>;
    }

    export namespace GetPublicMonitorHistory {
        export const Params = z.object({
            monitorId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;

        export const Query = z.object({
            days: z.coerce.number().int().min(1).max(365).optional().default(90),
        });
        export type Query = z.infer<typeof Query>;

        export const LatencyStats = z.object({
            avg_response_time_ms: z.number().nullable(),
            min_response_time_ms: z.number().nullable(),
            max_response_time_ms: z.number().nullable(),
            p95_response_time_ms: z.number().nullable(),
        });
        export type LatencyStats = z.infer<typeof LatencyStats>;

        export const LatencyBucket = z.object({
            date: z.string(),
            status: HistoryStatus,
            uptime_percentage: z.number().min(0).max(100),
            total_checks: z.number().int(),
            avg_response_time_ms: z.number().nullable(),
        });
        export type LatencyBucket = z.infer<typeof LatencyBucket>;

        export const Response = z.object({
            days: z.number().int(),
            start_date: z.string(),
            end_date: z.string(),
            uptime_percentage: z.number().min(0).max(100),
            total_checks: z.number().int(),
            latency: LatencyStats,
            buckets: z.array(LatencyBucket),
            recent_checks: z.array(createSelectSchema(DB.Tables.monitorStatusChecks)),
        });
        export type Response = z.infer<typeof Response>;
    }

    export const HistoryBucket = z.object({
        date: z.string(),
        status: HistoryStatus,
        uptime_percentage: z.number().min(0).max(100),
        total_checks: z.number().int(),
    });
    export type HistoryBucket = z.infer<typeof HistoryBucket>;

    export const MonitorHistory = z.object({
        monitor_id: z.number().int(),
        name: z.string(),
        display_name: z.string().nullable(),
        group_id: z.number().nullable(),
        uptime_percentage: z.number().min(0).max(100),
        buckets: z.array(HistoryBucket),
    });
    export type MonitorHistory = z.infer<typeof MonitorHistory>;

    export namespace GetHistory {
        export const Query = z.object({
            days: z.coerce.number().int().min(1).max(365).optional().default(90),
        });
        export type Query = z.infer<typeof Query>;

        export const Response = z.object({
            days: z.number().int(),
            start_date: z.string(),
            end_date: z.string(),
            monitors: z.array(MonitorHistory),
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

    export namespace ReorderGroups {
        export const Body = z.object({
            groups: z.array(z.object({
                id: z.number().int(),
                sort_order: z.number().int(),
            })),
        });
        export type Body = z.infer<typeof Body>;

        export const Response = z.object({
            groups: z.array(BaseGroup),
        });
        export type Response = z.infer<typeof Response>;
    }

    export namespace ReorderLinks {
        export const Body = z.object({
            links: z.array(z.object({
                id: z.number().int(),
                group_id: z.number().int().nullable(),
                sort_order: z.number().int(),
            })),
        });
        export type Body = z.infer<typeof Body>;

        export const Response = z.object({
            links: z.array(BaseLink.extend({
                monitor_name: z.string(),
            })),
        });
        export type Response = z.infer<typeof Response>;
    }
}
