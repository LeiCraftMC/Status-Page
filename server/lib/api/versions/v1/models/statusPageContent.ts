import { createSelectSchema, createInsertSchema, createUpdateSchema } from "drizzle-zod";
import { DB } from "../../../../../db";
import z from "zod";

export namespace StatusPageContentModel {

    export const BaseIncident = createSelectSchema(DB.Tables.incidents);
    export type BaseIncident = z.infer<typeof BaseIncident>;

    export const BaseMaintenance = createSelectSchema(DB.Tables.maintenance);
    export type BaseMaintenance = z.infer<typeof BaseMaintenance>;

    export const BaseUpdate = createSelectSchema(DB.Tables.statusUpdates);
    export type BaseUpdate = z.infer<typeof BaseUpdate>;

    export const IncidentWithUpdates = BaseIncident.extend({
        updates: z.array(BaseUpdate),
    });
    export type IncidentWithUpdates = z.infer<typeof IncidentWithUpdates>;

    export const MaintenanceWithUpdates = BaseMaintenance.extend({
        updates: z.array(BaseUpdate),
    });
    export type MaintenanceWithUpdates = z.infer<typeof MaintenanceWithUpdates>;

    export namespace IncidentId {
        export const Params = z.object({
            incidentId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;

        export const Body = createInsertSchema(DB.Tables.incidents, {
            title: z.string().min(1).max(128),
            message: z.string().min(1).max(4096),
            status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']),
            severity: z.enum(['critical', 'major', 'minor', 'maintenance']),
        }).omit({
            id: true,
            is_resolved: true,
            started_at: true,
            resolved_at: true,
            created_at: true,
            updated_at: true,
        });
        export type Body = z.infer<typeof Body>;

        export const UpdateBody = createUpdateSchema(DB.Tables.incidents, {
            title: z.string().min(1).max(128),
            message: z.string().min(1).max(4096),
            status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']),
            severity: z.enum(['critical', 'major', 'minor', 'maintenance']),
        }).omit({
            id: true,
            started_at: true,
            resolved_at: true,
            created_at: true,
            updated_at: true,
        }).partial().refine(
            (data) => Object.values(data).some((value) => value !== undefined),
            { message: "At least one field must be provided" }
        );
        export type UpdateBody = z.infer<typeof UpdateBody>;

        // Update entries attached to this incident
        export const UpdateParams = z.object({
            incidentId: z.coerce.number().int().positive(),
            updateId: z.coerce.number().int().positive(),
        });
        export type UpdateParams = z.infer<typeof UpdateParams>;

        export const CreateUpdateBody = z.object({
            message: z.string().min(1).max(8192),
            status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']),
        });
        export type CreateUpdateBody = z.infer<typeof CreateUpdateBody>;

        export const UpdateUpdateBody = z.object({
            message: z.string().min(1).max(8192).optional(),
            status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']).optional(),
        }).refine(
            (data) => Object.values(data).some((value) => value !== undefined),
            { message: "At least one field must be provided" }
        );
        export type UpdateUpdateBody = z.infer<typeof UpdateUpdateBody>;
    }

    export namespace MaintenanceId {
        export const Params = z.object({
            maintenanceId: z.coerce.number().int().positive(),
        });
        export type Params = z.infer<typeof Params>;

        export const Body = createInsertSchema(DB.Tables.maintenance, {
            title: z.string().min(1).max(128),
            message: z.string().min(1).max(4096),
            status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
        }).omit({
            id: true,
            created_at: true,
            updated_at: true,
        }).extend({
            scheduled_start_at: z.coerce.number().int(),
            scheduled_end_at: z.coerce.number().int().optional(),
        });
        export type Body = z.infer<typeof Body>;

        export const UpdateBody = createUpdateSchema(DB.Tables.maintenance, {
            title: z.string().min(1).max(128),
            message: z.string().min(1).max(4096),
            status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
        }).omit({
            id: true,
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

        // Update entries attached to this maintenance entry
        export const UpdateParams = z.object({
            maintenanceId: z.coerce.number().int().positive(),
            updateId: z.coerce.number().int().positive(),
        });
        export type UpdateParams = z.infer<typeof UpdateParams>;

        export const CreateUpdateBody = z.object({
            message: z.string().min(1).max(8192),
            status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),
        });
        export type CreateUpdateBody = z.infer<typeof CreateUpdateBody>;

        export const UpdateUpdateBody = z.object({
            message: z.string().min(1).max(8192).optional(),
            status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']).optional(),
        }).refine(
            (data) => Object.values(data).some((value) => value !== undefined),
            { message: "At least one field must be provided" }
        );
        export type UpdateUpdateBody = z.infer<typeof UpdateUpdateBody>;
    }

    export namespace Lists {
        export const Incidents = z.array(IncidentWithUpdates);
        export const Maintenance = z.array(MaintenanceWithUpdates);
        export const UpdateEntries = z.array(BaseUpdate);
    }
}
