
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { desc, eq, and, inArray } from "drizzle-orm";
import { DB } from "../../../../../../db";
import { APIResponse } from "../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { AuthHandler } from "../../../../utils/authHandler";
import { StatusPageContentModel } from "../../models/statusPageContent";
import { fetchParentedUpdates } from "./helpers";
import { DOCS_TAGS } from "../../docs";

const TARGET_INCIDENT_KEY = "targetIncident";
const TARGET_MAINTENANCE_KEY = "targetMaintenance";

function requireAdmin(c: any): AuthHandler.SessionAuthContext | null {
    const authContext = c.get("authContext") as AuthHandler.AuthContext;
    if (authContext.type !== 'session' || authContext.user_role !== 'admin') {
        return null;
    }
    return authContext;
}

function adminOnly(c: any, next: any) {
    if (!requireAdmin(c)) {
        return APIResponse.forbidden(c, "Admin access required");
    }
    return next();
}

type ContentVariables = {
    targetIncident: DB.Models.Incident;
    targetMaintenance: DB.Models.Maintenance;
};

export const router = new Hono<{ Variables: ContentVariables }>().basePath('/');

/**
 * Fetches an update entry and verifies it belongs to the given parent.
 */
async function fetchScopedUpdate(
    updateId: number,
    parentType: 'incident' | 'maintenance',
    parentId: number
): Promise<DB.Models.StatusUpdate | null> {
    const update = await DB.instance().select().from(DB.Tables.statusUpdates).where(
        eq(DB.Tables.statusUpdates.id, updateId)
    ).get();

    if (!update || update.parent_type !== parentType || update.parent_id !== parentId) {
        return null;
    }
    return update;
}

/**
 * Applies an update's status to its incident, syncing the resolution state.
 */
async function syncIncidentStatus(incidentId: number, status: DB.Models.Incident['status']): Promise<void> {
    const incident = await DB.instance().select().from(DB.Tables.incidents).where(
        eq(DB.Tables.incidents.id, incidentId)
    ).get();

    if (!incident) return;

    const updates: Record<string, unknown> = { status, updated_at: Date.now() };

    if (status === 'resolved' && !incident.is_resolved) {
        updates.is_resolved = true;
        updates.resolved_at = Date.now();
    } else if (status !== 'resolved' && incident.is_resolved) {
        updates.is_resolved = false;
        updates.resolved_at = null;
    }

    await DB.instance().update(DB.Tables.incidents).set(updates).where(
        eq(DB.Tables.incidents.id, incidentId)
    ).run();
}

/**
 * Applies an update's status to its maintenance entry.
 */
async function syncMaintenanceStatus(maintenanceId: number, status: DB.Models.Maintenance['status']): Promise<void> {
    await DB.instance().update(DB.Tables.maintenance).set({
        status,
        updated_at: Date.now(),
    }).where(
        eq(DB.Tables.maintenance.id, maintenanceId)
    ).run();
}

// Incidents

router.get('/incidents',

    APIRouteSpec.authenticated({

        summary: "List incidents",
        description: "Retrieve all incidents for the status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],
        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Incidents retrieved successfully", StatusPageContentModel.Lists.Incidents),
            APIResponseSpec.unauthorized("Authentication required")
        )
    }),

    async (c) => {
        const incidents = await DB.instance()
            .select()
            .from(DB.Tables.incidents)
            .orderBy(desc(DB.Tables.incidents.started_at));

        const updatesByIncident = await fetchParentedUpdates('incident', incidents.map((i) => i.id));

        const withUpdates = incidents.map((incident) => ({
            ...incident,
            updates: updatesByIncident.get(incident.id) ?? [],
        }));

        return APIResponse.success(c, "Incidents retrieved successfully", withUpdates);
    }
);

router.post('/incidents',

    APIRouteSpec.authenticated({
        summary: "Create incident",
        description: "Publish a new incident on the status page. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],
        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Incident created successfully", StatusPageContentModel.BaseIncident),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    adminOnly,
    zValidator("json", StatusPageContentModel.IncidentId.Body),

    async (c) => {
        const body = c.req.valid("json") as StatusPageContentModel.IncidentId.Body;

        const now = Date.now();
        const created = await DB.instance().insert(DB.Tables.incidents).values({
            ...body,
            started_at: now,
            updated_at: now,
        }).returning().get();

        return APIResponse.created(c, "Incident created successfully", created);
    }
);

router.use('/incidents/:incidentId/*',
    zValidator("param", StatusPageContentModel.IncidentId.Params),
    async (c, next) => {
        // @ts-ignore — zValidator param target typing is lost in middleware chains
        const { incidentId } = c.req.valid("param") as StatusPageContentModel.IncidentId.Params;

        const incident = await DB.instance().select().from(DB.Tables.incidents).where(
            eq(DB.Tables.incidents.id, incidentId)
        ).get();

        if (!incident) {
            return APIResponse.notFound(c, "Incident not found");
        }

        // @ts-ignore — Hono's context variables type is lost across the zValidator chain
        c.set(TARGET_INCIDENT_KEY, incident);
        await next();
    }
);

router.get('/incidents/:incidentId',
    APIRouteSpec.authenticated({
        summary: "Get incident",
        description: "Retrieve a single incident with its update timeline. Readable regardless of the status page's public flag.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],
        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Incident retrieved successfully", StatusPageContentModel.IncidentWithUpdates),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Incident not found")
        )
    }),
    async (c) => {
        const incident = c.get(TARGET_INCIDENT_KEY) as StatusPageContentModel.BaseIncident;

        const grouped = await fetchParentedUpdates('incident', [incident.id]);

        return APIResponse.success(c, "Incident retrieved successfully", {
            ...incident,
            updates: grouped.get(incident.id) ?? [],
        });
    }
);

router.put('/incidents/:incidentId',
    adminOnly,
    zValidator("json", StatusPageContentModel.IncidentId.UpdateBody),
    APIRouteSpec.authenticated({
        summary: "Update incident",
        description: "Update an incident's status, severity, or message. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],
        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Incident updated successfully", StatusPageContentModel.BaseIncident),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Incident not found")
        )
    }),
    async (c) => {
        const incident = c.get(TARGET_INCIDENT_KEY) as StatusPageContentModel.BaseIncident;
        const body = c.req.valid("json") as StatusPageContentModel.IncidentId.UpdateBody;

        const updates: any = { ...body, updated_at: Date.now() };
        if (body.status === 'resolved' && !incident.is_resolved) {
            updates.is_resolved = true;
            updates.resolved_at = Date.now();
        } else if (body.status && body.status !== 'resolved' && incident.is_resolved) {
            updates.is_resolved = false;
            updates.resolved_at = null;
        }

        await DB.instance().update(DB.Tables.incidents).set(updates).where(
            eq(DB.Tables.incidents.id, incident.id)
        ).run();

        const refreshed = await DB.instance().select().from(DB.Tables.incidents).where(
            eq(DB.Tables.incidents.id, incident.id)
        ).get();

        if (!refreshed) {
            throw new Error("Incident not found after update");
        }

        return APIResponse.success(c, "Incident updated successfully", refreshed);
    }
);

router.delete('/incidents/:incidentId',
    adminOnly,
    APIRouteSpec.authenticated({
        summary: "Delete incident",
        description: "Remove an incident from the status page. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],
        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Incident deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Incident not found")
        )
    }),
    async (c) => {
        const incident = c.get(TARGET_INCIDENT_KEY) as StatusPageContentModel.BaseIncident;

        await DB.instance().delete(DB.Tables.statusUpdates).where(
            and(
                eq(DB.Tables.statusUpdates.parent_type, 'incident'),
                eq(DB.Tables.statusUpdates.parent_id, incident.id)
            )
        ).run();

        await DB.instance().delete(DB.Tables.incidents).where(
            eq(DB.Tables.incidents.id, incident.id)
        ).run();

        return APIResponse.successNoData(c, "Incident deleted successfully");
    }
);

// Maintenance

router.get('/maintenance',
    APIRouteSpec.authenticated({
        summary: "List maintenance",
        description: "Retrieve all scheduled maintenance entries for the status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],
        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Maintenance retrieved successfully", StatusPageContentModel.Lists.Maintenance),
            APIResponseSpec.unauthorized("Authentication required")
        )
    }),
    async (c) => {
        const maintenance = await DB.instance()
            .select()
            .from(DB.Tables.maintenance)
            .orderBy(desc(DB.Tables.maintenance.scheduled_start_at));

        const updatesByMaintenance = await fetchParentedUpdates('maintenance', maintenance.map((m) => m.id));

        const withUpdates = maintenance.map((entry) => ({
            ...entry,
            updates: updatesByMaintenance.get(entry.id) ?? [],
        }));

        return APIResponse.success(c, "Maintenance retrieved successfully", withUpdates);
    }
);

router.post('/maintenance',
    adminOnly,
    zValidator("json", StatusPageContentModel.MaintenanceId.Body),
    APIRouteSpec.authenticated({
        summary: "Create maintenance",
        description: "Publish a new scheduled maintenance entry on the status page. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],
        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Maintenance created successfully", StatusPageContentModel.BaseMaintenance),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),
    async (c) => {
        const body = c.req.valid("json") as StatusPageContentModel.MaintenanceId.Body;

        const now = Date.now();
        const created = await DB.instance().insert(DB.Tables.maintenance).values({
            ...body,
            created_at: now,
            updated_at: now,
        }).returning().get();

        return APIResponse.created(c, "Maintenance created successfully", created);
    }
);

router.use('/maintenance/:maintenanceId/*',
    zValidator("param", StatusPageContentModel.MaintenanceId.Params),
    async (c, next) => {
        // @ts-ignore — zValidator param target typing is lost in middleware chains
        const { maintenanceId } = c.req.valid("param") as StatusPageContentModel.MaintenanceId.Params;

        const maintenance = await DB.instance().select().from(DB.Tables.maintenance).where(
            eq(DB.Tables.maintenance.id, maintenanceId)
        ).get();

        if (!maintenance) {
            return APIResponse.notFound(c, "Maintenance not found");
        }

        // @ts-ignore — Hono's context variables type is lost across the zValidator chain
        c.set(TARGET_MAINTENANCE_KEY, maintenance);
        await next();
    }
);

router.get('/maintenance/:maintenanceId',
    APIRouteSpec.authenticated({
        summary: "Get maintenance",
        description: "Retrieve a single scheduled maintenance entry with its update timeline. Readable regardless of the status page's public flag.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],
        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Maintenance retrieved successfully", StatusPageContentModel.MaintenanceWithUpdates),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Maintenance not found")
        )
    }),
    async (c) => {
        const maintenance = c.get(TARGET_MAINTENANCE_KEY) as StatusPageContentModel.BaseMaintenance;

        const grouped = await fetchParentedUpdates('maintenance', [maintenance.id]);

        return APIResponse.success(c, "Maintenance retrieved successfully", {
            ...maintenance,
            updates: grouped.get(maintenance.id) ?? [],
        });
    }
);

router.put('/maintenance/:maintenanceId',
    adminOnly,
    zValidator("json", StatusPageContentModel.MaintenanceId.UpdateBody),
    APIRouteSpec.authenticated({
        summary: "Update maintenance",
        description: "Update a scheduled maintenance entry. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],
        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Maintenance updated successfully", StatusPageContentModel.BaseMaintenance),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Maintenance not found")
        )
    }),
    async (c) => {
        const maintenance = c.get(TARGET_MAINTENANCE_KEY) as StatusPageContentModel.BaseMaintenance;
        const body = c.req.valid("json") as StatusPageContentModel.MaintenanceId.UpdateBody;

        await DB.instance().update(DB.Tables.maintenance).set({
            ...body,
            updated_at: Date.now(),
        }).where(
            eq(DB.Tables.maintenance.id, maintenance.id)
        ).run();

        const refreshed = await DB.instance().select().from(DB.Tables.maintenance).where(
            eq(DB.Tables.maintenance.id, maintenance.id)
        ).get();

        if (!refreshed) {
            throw new Error("Maintenance not found after update");
        }

        return APIResponse.success(c, "Maintenance updated successfully", refreshed);
    }
);

router.delete('/maintenance/:maintenanceId',
    adminOnly,
    APIRouteSpec.authenticated({
        summary: "Delete maintenance",
        description: "Remove a scheduled maintenance entry. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],
        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Maintenance deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Maintenance not found")
        )
    }),
    async (c) => {
        const maintenance = c.get(TARGET_MAINTENANCE_KEY) as StatusPageContentModel.BaseMaintenance;

        await DB.instance().delete(DB.Tables.statusUpdates).where(
            and(
                eq(DB.Tables.statusUpdates.parent_type, 'maintenance'),
                eq(DB.Tables.statusUpdates.parent_id, maintenance.id)
            )
        ).run();

        await DB.instance().delete(DB.Tables.maintenance).where(
            eq(DB.Tables.maintenance.id, maintenance.id)
        ).run();

        return APIResponse.successNoData(c, "Maintenance deleted successfully");
    }
);

// Incident update entries

router.get('/incidents/:incidentId/updates',

    APIRouteSpec.authenticated({
        summary: "List incident updates",
        description: "Retrieve all update entries for an incident, newest first.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Incident updates retrieved successfully", StatusPageContentModel.Lists.UpdateEntries),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Incident not found")
        )
    }),

    async (c) => {
        const incident = c.get(TARGET_INCIDENT_KEY) as StatusPageContentModel.BaseIncident;

        const grouped = await fetchParentedUpdates('incident', [incident.id]);
        const updates = grouped.get(incident.id) ?? [];

        return APIResponse.success(c, "Incident updates retrieved successfully", updates);
    }
);

router.post('/incidents/:incidentId/updates',
    adminOnly,
    zValidator("json", StatusPageContentModel.IncidentId.CreateUpdateBody),
    APIRouteSpec.authenticated({
        summary: "Post incident update",
        description: "Post an update on an incident. The update carries a status that is also applied to the incident (including its resolution state). Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Incident update posted successfully", StatusPageContentModel.BaseUpdate),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Incident not found")
        )
    }),
    async (c) => {
        const incident = c.get(TARGET_INCIDENT_KEY) as StatusPageContentModel.BaseIncident;
        const body = c.req.valid("json") as StatusPageContentModel.IncidentId.CreateUpdateBody;

        const now = Date.now();
        const created = await DB.instance().insert(DB.Tables.statusUpdates).values({
            parent_type: 'incident',
            parent_id: incident.id,
            message: body.message,
            status: body.status,
            created_at: now,
            updated_at: now,
        }).returning().get();

        await syncIncidentStatus(incident.id, body.status);

        return APIResponse.created(c, "Incident update posted successfully", created);
    }
);

router.put('/incidents/:incidentId/updates/:updateId',
    adminOnly,
    zValidator("param", StatusPageContentModel.IncidentId.UpdateParams),
    zValidator("json", StatusPageContentModel.IncidentId.UpdateUpdateBody),
    APIRouteSpec.authenticated({
        summary: "Edit incident update",
        description: "Edit an incident update's message, or its status (which is re-applied to the incident). Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Incident update edited successfully", StatusPageContentModel.BaseUpdate),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Incident or update not found")
        )
    }),
    async (c) => {
        const incident = c.get(TARGET_INCIDENT_KEY) as StatusPageContentModel.BaseIncident;
        // @ts-ignore — zValidator typing is lost in middleware chains
        const { updateId } = c.req.valid("param") as StatusPageContentModel.IncidentId.UpdateParams;
        const body = c.req.valid("json") as StatusPageContentModel.IncidentId.UpdateUpdateBody;

        const update = await fetchScopedUpdate(updateId, 'incident', incident.id);
        if (!update) {
            return APIResponse.notFound(c, "Incident or update not found");
        }

        const updates: Record<string, unknown> = { updated_at: Date.now() };
        if (body.message !== undefined) {
            updates.message = body.message;
        }
        if (body.status !== undefined) {
            updates.status = body.status;
            await syncIncidentStatus(incident.id, body.status);
        }

        await DB.instance().update(DB.Tables.statusUpdates).set(updates).where(
            eq(DB.Tables.statusUpdates.id, update.id)
        ).run();

        const refreshed = await DB.instance().select().from(DB.Tables.statusUpdates).where(
            eq(DB.Tables.statusUpdates.id, update.id)
        ).get();

        if (!refreshed) {
            throw new Error("Incident update not found after edit");
        }

        return APIResponse.success(c, "Incident update edited successfully", refreshed);
    }
);

router.delete('/incidents/:incidentId/updates/:updateId',
    adminOnly,
    zValidator("param", StatusPageContentModel.IncidentId.UpdateParams),
    APIRouteSpec.authenticated({
        summary: "Delete incident update",
        description: "Delete an update entry from an incident. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Incident update deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Incident or update not found")
        )
    }),
    async (c) => {
        const incident = c.get(TARGET_INCIDENT_KEY) as StatusPageContentModel.BaseIncident;
        // @ts-ignore — zValidator typing is lost in middleware chains
        const { updateId } = c.req.valid("param") as StatusPageContentModel.IncidentId.UpdateParams;

        const update = await fetchScopedUpdate(updateId, 'incident', incident.id);
        if (!update) {
            return APIResponse.notFound(c, "Incident or update not found");
        }

        await DB.instance().delete(DB.Tables.statusUpdates).where(
            eq(DB.Tables.statusUpdates.id, update.id)
        ).run();

        return APIResponse.successNoData(c, "Incident update deleted successfully");
    }
);

// Maintenance update entries

router.get('/maintenance/:maintenanceId/updates',

    APIRouteSpec.authenticated({
        summary: "List maintenance updates",
        description: "Retrieve all update entries for a scheduled maintenance entry, newest first.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Maintenance updates retrieved successfully", StatusPageContentModel.Lists.UpdateEntries),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Maintenance not found")
        )
    }),

    async (c) => {
        const maintenance = c.get(TARGET_MAINTENANCE_KEY) as StatusPageContentModel.BaseMaintenance;

        const grouped = await fetchParentedUpdates('maintenance', [maintenance.id]);
        const updates = grouped.get(maintenance.id) ?? [];

        return APIResponse.success(c, "Maintenance updates retrieved successfully", updates);
    }
);

router.post('/maintenance/:maintenanceId/updates',
    adminOnly,
    zValidator("json", StatusPageContentModel.MaintenanceId.CreateUpdateBody),
    APIRouteSpec.authenticated({
        summary: "Post maintenance update",
        description: "Post an update during scheduled maintenance. The update carries a status that is also applied to the maintenance entry. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Maintenance update posted successfully", StatusPageContentModel.BaseUpdate),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Maintenance not found")
        )
    }),
    async (c) => {
        const maintenance = c.get(TARGET_MAINTENANCE_KEY) as StatusPageContentModel.BaseMaintenance;
        const body = c.req.valid("json") as StatusPageContentModel.MaintenanceId.CreateUpdateBody;

        const now = Date.now();
        const created = await DB.instance().insert(DB.Tables.statusUpdates).values({
            parent_type: 'maintenance',
            parent_id: maintenance.id,
            message: body.message,
            status: body.status,
            created_at: now,
            updated_at: now,
        }).returning().get();

        await syncMaintenanceStatus(maintenance.id, body.status);

        return APIResponse.created(c, "Maintenance update posted successfully", created);
    }
);

router.put('/maintenance/:maintenanceId/updates/:updateId',
    adminOnly,
    zValidator("param", StatusPageContentModel.MaintenanceId.UpdateParams),
    zValidator("json", StatusPageContentModel.MaintenanceId.UpdateUpdateBody),
    APIRouteSpec.authenticated({
        summary: "Edit maintenance update",
        description: "Edit a maintenance update's message, or its status (which is re-applied to the maintenance entry). Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Maintenance update edited successfully", StatusPageContentModel.BaseUpdate),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Maintenance or update not found")
        )
    }),
    async (c) => {
        const maintenance = c.get(TARGET_MAINTENANCE_KEY) as StatusPageContentModel.BaseMaintenance;
        // @ts-ignore — zValidator typing is lost in middleware chains
        const { updateId } = c.req.valid("param") as StatusPageContentModel.MaintenanceId.UpdateParams;
        const body = c.req.valid("json") as StatusPageContentModel.MaintenanceId.UpdateUpdateBody;

        const update = await fetchScopedUpdate(updateId, 'maintenance', maintenance.id);
        if (!update) {
            return APIResponse.notFound(c, "Maintenance or update not found");
        }

        const updates: Record<string, unknown> = { updated_at: Date.now() };
        if (body.message !== undefined) {
            updates.message = body.message;
        }
        if (body.status !== undefined) {
            updates.status = body.status;
            await syncMaintenanceStatus(maintenance.id, body.status);
        }

        await DB.instance().update(DB.Tables.statusUpdates).set(updates).where(
            eq(DB.Tables.statusUpdates.id, update.id)
        ).run();

        const refreshed = await DB.instance().select().from(DB.Tables.statusUpdates).where(
            eq(DB.Tables.statusUpdates.id, update.id)
        ).get();

        if (!refreshed) {
            throw new Error("Maintenance update not found after edit");
        }

        return APIResponse.success(c, "Maintenance update edited successfully", refreshed);
    }
);

router.delete('/maintenance/:maintenanceId/updates/:updateId',
    adminOnly,
    zValidator("param", StatusPageContentModel.MaintenanceId.UpdateParams),
    APIRouteSpec.authenticated({
        summary: "Delete maintenance update",
        description: "Delete an update entry from a scheduled maintenance entry. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Maintenance update deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Maintenance or update not found")
        )
    }),
    async (c) => {
        const maintenance = c.get(TARGET_MAINTENANCE_KEY) as StatusPageContentModel.BaseMaintenance;
        // @ts-ignore — zValidator typing is lost in middleware chains
        const { updateId } = c.req.valid("param") as StatusPageContentModel.MaintenanceId.UpdateParams;

        const update = await fetchScopedUpdate(updateId, 'maintenance', maintenance.id);
        if (!update) {
            return APIResponse.notFound(c, "Maintenance or update not found");
        }

        await DB.instance().delete(DB.Tables.statusUpdates).where(
            eq(DB.Tables.statusUpdates.id, update.id)
        ).run();

        return APIResponse.successNoData(c, "Maintenance update deleted successfully");
    }
);

