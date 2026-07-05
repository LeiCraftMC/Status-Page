import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { DB } from "../../../../../../../db";
import { z } from "zod";

export namespace MonitorsModel {

    export const BaseMonitor = createSelectSchema(DB.Tables.monitors);
    export type BaseMonitor = z.infer<typeof BaseMonitor>;

    export namespace StatusCheck {
        export const Base = createSelectSchema(DB.Tables.monitorStatusChecks);
        export type Base = z.infer<typeof Base>;
    }

    export namespace GetAll {
        export const Response = z.array(BaseMonitor);
        export type Response = z.infer<typeof Response>;
    }

    export namespace Create {
        const InsertSchema = createInsertSchema(DB.Tables.monitors, {
            name: z.string().min(1).max(64),
            type: z.enum(['http', 'tcp']),
            target: z.string().min(1).max(512),
            interval_seconds: z.coerce.number().int().min(10).max(86400),
            timeout_seconds: z.coerce.number().int().min(1).max(300),
        }).omit({
            id: true,
            created_at: true,
        });

        export const Body = InsertSchema.extend({
            http_method: z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).optional(),
            expected_http_status: z.coerce.number().int().min(100).max(599).optional(),
        }).refine((data) => {
            if (data.type === 'tcp') {
                return !data.http_method && !data.expected_http_status;
            }
            return true;
        }, {
            message: "HTTP-specific fields must not be provided for TCP monitors",
        }).refine((data) => {
            if (data.type === 'http') {
                return data.http_method !== undefined;
            }
            return true;
        }, {
            message: "http_method is required for HTTP monitors",
            path: ["http_method"],
        });
        export type Body = z.infer<typeof Body>;

        export const Response = BaseMonitor;
        export type Response = z.infer<typeof Response>;
    }

    export namespace Update {
        export const Body = createUpdateSchema(DB.Tables.monitors, {
            name: z.string().min(1).max(64),
            type: z.enum(['http', 'tcp']),
            target: z.string().min(1).max(512),
            interval_seconds: z.coerce.number().int().min(10).max(86400),
            timeout_seconds: z.coerce.number().int().min(1).max(300),
        }).omit({
            id: true,
            created_at: true,
        }).partial().extend({
            http_method: z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).optional(),
            expected_http_status: z.coerce.number().int().min(100).max(599).optional(),
        }).refine(
            (data) => Object.values(data).some((value) => value !== undefined),
            { message: "At least one field must be provided" }
        );
        export type Body = z.infer<typeof Body>;

        export const Response = BaseMonitor;
        export type Response = z.infer<typeof Response>;
    }

    export namespace MonitorId {
        export const Params = z.object({
            monitorId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;
    }

    export namespace TriggerCheck {
        export const Response = z.object({
            check: StatusCheck.Base,
        });
        export type Response = z.infer<typeof Response>;
    }
}
