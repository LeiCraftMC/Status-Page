import { createSelectSchema, createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { DB } from "../../../../../../db";
import { MonitorStats } from "../../../../../../utils/monitor-stats";
import { MonitorTypes } from "../../../../../../utils/monitor-types";
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

export namespace MonitorsModel {

    const MonitorTypeName = z.enum(DB.Tables.monitors.type.enumValues);

    /** Adds an issue for each type-specific field that does not fit the monitor type (see MonitorTypes). */
    function refineTypeSpecificFields(data: { type?: DB.Models.Monitor["type"] } & MonitorTypes.FieldValues, ctx: z.RefinementCtx) {
        // An update that keeps the type is not checked: the stored fields are unknown here.
        if (!data.type) return;
        for (const message of MonitorTypes.validateFields(data.type, data)) {
            ctx.addIssue({ code: "custom", message });
        }
    }

    export const BaseMonitor = createSelectSchema(DB.Tables.monitors);
    export type BaseMonitor = z.infer<typeof BaseMonitor>;

    export namespace MonitorId {
        export const Params = z.object({
            monitorId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;
    }

    export namespace Create {
        export const Body = createInsertSchema(DB.Tables.monitors, {
            name: z.string().min(1).max(128),
            type: MonitorTypeName,
            target: z.string().min(1).max(2048),
            interval_seconds: z.number().int().min(5),
            timeout_seconds: z.number().int().min(1),
            http_method: z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).optional(),
            expected_http_status: z.number().int().min(100).max(599).optional(),
            follow_redirects: z.boolean().optional(),
            verify_tls: z.boolean().optional(),
            is_enabled: z.boolean().optional(),
        }).omit({
            id: true,
            created_at: true,
        }).extend({
            prefill_history: z.boolean().optional().meta({
                description: `Fill the ${MonitorStats.PREFILL_DAYS} days before today with all-up uptime history (no latency data). Defaults to false.`,
            }),
        }).superRefine(refineTypeSpecificFields);
        export type Body = z.infer<typeof Body>;

        export const Response = BaseMonitor;
        export type Response = z.infer<typeof Response>;
    }

    export namespace Update {
        export const Body = createUpdateSchema(DB.Tables.monitors, {
            name: z.string().min(1).max(128).optional(),
            type: MonitorTypeName.optional(),
            target: z.string().min(1).max(2048).optional(),
            interval_seconds: z.number().int().min(5).optional(),
            timeout_seconds: z.number().int().min(1).optional(),
            http_method: z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).optional(),
            expected_http_status: z.number().int().min(100).max(599).optional().nullable(),
            follow_redirects: z.boolean().optional(),
            verify_tls: z.boolean().optional(),
            is_enabled: z.boolean().optional(),
        }).omit({
            id: true,
            created_at: true,
        }).refine(
            (data) => Object.values(data).some((value) => value !== undefined),
            { message: "At least one field must be provided" }
        ).superRefine(refineTypeSpecificFields);
        export type Body = z.infer<typeof Body>;

        export const Response = BaseMonitor;
        export type Response = z.infer<typeof Response>;
    }

    export namespace TriggerCheck {
        export const Response = z.object({
            check: createSelectSchema(DB.Tables.monitorStatusChecks),
        });
        export type Response = z.infer<typeof Response>;
    }

    export namespace Pause {
        export const Response = BaseMonitor;
        export type Response = z.infer<typeof Response>;
    }
}
