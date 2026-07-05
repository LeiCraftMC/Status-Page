import { createSelectSchema, createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { DB } from "../../../../../../../db";
import z from "zod";

export namespace StatusPageContentModel {

    export const BaseIncident = createSelectSchema(DB.Tables.statusPageIncidents);
    export type BaseIncident = z.infer<typeof BaseIncident>;

    export const BaseMaintenance = createSelectSchema(DB.Tables.statusPageMaintenance);
    export type BaseMaintenance = z.infer<typeof BaseMaintenance>;

    export const BaseUpdate = createSelectSchema(DB.Tables.statusPageUpdates);
    export type BaseUpdate = z.infer<typeof BaseUpdate>;

    export namespace SlugParams {
        export const Params = z.object({
            slug: z.string().min(1),
        });
        export type Params = z.infer<typeof Params>;
    }

    export namespace IncidentId {
        export const Params = z.object({
            slug: z.string().min(1),
            incidentId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;

        export const Body = createInsertSchema(DB.Tables.statusPageIncidents, {
            title: z.string().min(1).max(128),
            message: z.string().min(1).max(4096),
            status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']),
            severity: z.enum(['critical', 'major', 'minor', 'maintenance']),
        }).omit({
            id: true,
            status_page_id: true,
            is_resolved: true,
            started_at: true,
            resolved_at: true,
            created_at: true,
            updated_at: true,
        });
        export type Body = z.infer<typeof Body>;

        export const UpdateBody = createUpdateSchema(DB.Tables.statusPageIncidents, {
            title: z.string().min(1).max(128),
            message: z.string().min(1).max(4096),
            status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']),
            severity: z.enum(['critical', 'major', 'minor', 'maintenance']),
        }).omit({
            id: true,
            status_page_id: true,
            started_at: true,
            resolved_at: true,
            created_at: true,
            updated_at: true,
        }).partial().refine(
            (data) => Object.values(data).some((value) => value !== undefined),
            { message: "At least one field must be provided" }
        );
        export type UpdateBody = z.infer<typeof UpdateBody>;
    }

    export namespace MaintenanceId {
        export const Params = z.object({
            slug: z.string().min(1),
            maintenanceId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;

        export const Body = createInsertSchema(DB.Tables.statusPageMaintenance, {
            title: z.string().min(1).max(128),
            message: z.string().min(1).max(4096),
            status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
        }).omit({
            id: true,
            status_page_id: true,
            created_at: true,
            updated_at: true,
        }).extend({
            scheduled_start_at: z.coerce.number().int(),
            scheduled_end_at: z.coerce.number().int().optional(),
        });
        export type Body = z.infer<typeof Body>;

        export const UpdateBody = createUpdateSchema(DB.Tables.statusPageMaintenance, {
            title: z.string().min(1).max(128),
            message: z.string().min(1).max(4096),
            status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
        }).omit({
            id: true,
            status_page_id: true,
            created_at: true,
            updated_at: true,
        }).partial().extend({
            scheduled_start_at: z.coerce.number().int().optional(),
            scheduled_end_at: z.coerce.number().int().optional().nullable(),
        }).refine(
            (data) => Object.values(data).some((value) => value !== undefined),
            { message: "At least one field must be provided" }
        );
        export type UpdateBody = z.infer<typeof UpdateBody>;
    }

    export namespace UpdateId {
        export const Params = z.object({
            slug: z.string().min(1),
            updateId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;

        export const Body = createInsertSchema(DB.Tables.statusPageUpdates, {
            title: z.string().min(1).max(128),
            message: z.string().min(1).max(4096),
            type: z.enum(['general', 'incident', 'maintenance']),
        }).omit({
            id: true,
            status_page_id: true,
            created_at: true,
            updated_at: true,
        });
        export type Body = z.infer<typeof Body>;

        export const UpdateBody = createUpdateSchema(DB.Tables.statusPageUpdates, {
            title: z.string().min(1).max(128),
            message: z.string().min(1).max(4096),
            type: z.enum(['general', 'incident', 'maintenance']),
        }).omit({
            id: true,
            status_page_id: true,
            created_at: true,
            updated_at: true,
        }).partial().refine(
            (data) => Object.values(data).some((value) => value !== undefined),
            { message: "At least one field must be provided" }
        );
        export type UpdateBody = z.infer<typeof UpdateBody>;
    }

    export namespace Lists {
        export const Incidents = z.array(BaseIncident);
        export const Maintenance = z.array(BaseMaintenance);
        export const Updates = z.array(BaseUpdate);
    }
}
