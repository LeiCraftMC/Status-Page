import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { desc, eq } from "drizzle-orm";
import { DB } from "../../../../../../../db";
import { APIResponse } from "../../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { AuthHandler } from "../../../../../utils/authHandler";
import { StatusPageContentModel } from "../../../models/statusPageContent";
import { DOCS_TAGS } from "../../../docs";

const TARGET_INCIDENT_KEY = "targetIncident";
const TARGET_MAINTENANCE_KEY = "targetMaintenance";
const TARGET_UPDATE_KEY = "targetUpdate";

function requireAdmin(c: any): AuthHandler.SessionAuthContext | null {
    const authContext = c.get("authContext") as AuthHandler.AuthContext;
    if (authContext.type !== 'session' || authContext.user_role !== 'admin') {
        return null;
    }
    return authContext;
}

export const router = new Hono().basePath('/');

router.use("*", async (c, next) => {
    if (!requireAdmin(c)) {
        return APIResponse.forbidden(c, "Admin access required");
    }
    await next();
});

// Incidents

router.get('/incidents',

    APIRouteSpec.authenticated({
        summary: "List incidents",
        description: "Retrieve all incidents for the status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Incidents retrieved successfully", StatusPageContentModel.Lists.Incidents),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    async (c) => {
        const incidents = await DB.instance()
            .select()
            .from(DB.Tables.incidents)
            .orderBy(desc(DB.Tables.incidents.started_at));

        return APIResponse.success(c, "Incidents retrieved successfully", incidents);
    }
);

router.post('/incidents',

    APIRouteSpec.authenticated({
        summary: "Create incident",
        description: "Publish a new incident on the status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Incident created successfully", StatusPageContentModel.BaseIncident),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

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

// @ts-ignore
router.use('/incidents/:incidentId/*',
    zValidator("param", StatusPageContentModel.IncidentId.Params),

    async (c, next) => {
        // @ts-ignore
        const { incidentId } = c.req.valid("param") as StatusPageContentModel.IncidentId.Params;

        const incident = await DB.instance().select().from(DB.Tables.incidents).where(
            eq(DB.Tables.incidents.id, incidentId)
        ).get();

        if (!incident) {
            return APIResponse.notFound(c, "Incident not found");
        }

        // @ts-ignore
        c.set(TARGET_INCIDENT_KEY, incident);
        await next();
    }
);

router.put('/incidents/:incidentId',

    APIRouteSpec.authenticated({
        summary: "Update incident",
        description: "Update an incident's status, severity, or message.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Incident updated successfully", StatusPageContentModel.BaseIncident),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Incident not found")
        )
    }),

    zValidator("json", StatusPageContentModel.IncidentId.UpdateBody),

    async (c) => {
        // @ts-ignore
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

    APIRouteSpec.authenticated({
        summary: "Delete incident",
        description: "Remove an incident from the status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Incident deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Incident not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const incident = c.get(TARGET_INCIDENT_KEY) as StatusPageContentModel.BaseIncident;

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
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    async (c) => {
        const maintenance = await DB.instance()
            .select()
            .from(DB.Tables.maintenance)
            .orderBy(desc(DB.Tables.maintenance.scheduled_start_at));

        return APIResponse.success(c, "Maintenance retrieved successfully", maintenance);
    }
);

router.post('/maintenance',

    APIRouteSpec.authenticated({
        summary: "Create maintenance",
        description: "Publish a new scheduled maintenance entry on the status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Maintenance created successfully", StatusPageContentModel.BaseMaintenance),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    zValidator("json", StatusPageContentModel.MaintenanceId.Body),

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

// @ts-ignore
router.use('/maintenance/:maintenanceId/*',
    zValidator("param", StatusPageContentModel.MaintenanceId.Params),

    async (c, next) => {
        // @ts-ignore
        const { maintenanceId } = c.req.valid("param") as StatusPageContentModel.MaintenanceId.Params;

        const maintenance = await DB.instance().select().from(DB.Tables.maintenance).where(
            eq(DB.Tables.maintenance.id, maintenanceId)
        ).get();

        if (!maintenance) {
            return APIResponse.notFound(c, "Maintenance not found");
        }

        // @ts-ignore
        c.set(TARGET_MAINTENANCE_KEY, maintenance);
        await next();
    }
);

router.put('/maintenance/:maintenanceId',

    APIRouteSpec.authenticated({
        summary: "Update maintenance",
        description: "Update a scheduled maintenance entry.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Maintenance updated successfully", StatusPageContentModel.BaseMaintenance),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Maintenance not found")
        )
    }),

    zValidator("json", StatusPageContentModel.MaintenanceId.UpdateBody),

    async (c) => {
        // @ts-ignore
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

    APIRouteSpec.authenticated({
        summary: "Delete maintenance",
        description: "Remove a scheduled maintenance entry.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Maintenance deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Maintenance not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const maintenance = c.get(TARGET_MAINTENANCE_KEY) as StatusPageContentModel.BaseMaintenance;

        await DB.instance().delete(DB.Tables.maintenance).where(
            eq(DB.Tables.maintenance.id, maintenance.id)
        ).run();

        return APIResponse.successNoData(c, "Maintenance deleted successfully");
    }
);

// Updates

router.get('/updates',

    APIRouteSpec.authenticated({
        summary: "List updates",
        description: "Retrieve all general updates for the status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Updates retrieved successfully", StatusPageContentModel.Lists.Updates),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    async (c) => {
        const updates = await DB.instance()
            .select()
            .from(DB.Tables.statusUpdates)
            .orderBy(desc(DB.Tables.statusUpdates.created_at));

        return APIResponse.success(c, "Updates retrieved successfully", updates);
    }
);

router.post('/updates',

    APIRouteSpec.authenticated({
        summary: "Create update",
        description: "Publish a new update on the status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Update created successfully", StatusPageContentModel.BaseUpdate),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    zValidator("json", StatusPageContentModel.UpdateId.Body),

    async (c) => {
        const body = c.req.valid("json") as StatusPageContentModel.UpdateId.Body;

        const now = Date.now();
        const created = await DB.instance().insert(DB.Tables.statusUpdates).values({
            ...body,
            created_at: now,
            updated_at: now,
        }).returning().get();

        return APIResponse.created(c, "Update created successfully", created);
    }
);

// @ts-ignore
router.use('/updates/:updateId/*',
    zValidator("param", StatusPageContentModel.UpdateId.Params),

    async (c, next) => {
        // @ts-ignore
        const { updateId } = c.req.valid("param") as StatusPageContentModel.UpdateId.Params;

        const update = await DB.instance().select().from(DB.Tables.statusUpdates).where(
            eq(DB.Tables.statusUpdates.id, updateId)
        ).get();

        if (!update) {
            return APIResponse.notFound(c, "Update not found");
        }

        // @ts-ignore
        c.set(TARGET_UPDATE_KEY, update);
        await next();
    }
);

router.put('/updates/:updateId',

    APIRouteSpec.authenticated({
        summary: "Update update",
        description: "Update a status page update.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Update updated successfully", StatusPageContentModel.BaseUpdate),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Update not found")
        )
    }),

    zValidator("json", StatusPageContentModel.UpdateId.UpdateBody),

    async (c) => {
        // @ts-ignore
        const update = c.get(TARGET_UPDATE_KEY) as StatusPageContentModel.BaseUpdate;
        const body = c.req.valid("json") as StatusPageContentModel.UpdateId.UpdateBody;

        await DB.instance().update(DB.Tables.statusUpdates).set({
            ...body,
            updated_at: Date.now(),
        }).where(
            eq(DB.Tables.statusUpdates.id, update.id)
        ).run();

        const refreshed = await DB.instance().select().from(DB.Tables.statusUpdates).where(
            eq(DB.Tables.statusUpdates.id, update.id)
        ).get();

        if (!refreshed) {
            throw new Error("Update not found after update");
        }

        return APIResponse.success(c, "Update updated successfully", refreshed);
    }
);

router.delete('/updates/:updateId',

    APIRouteSpec.authenticated({
        summary: "Delete update",
        description: "Remove a status page update.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Update deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Update not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const update = c.get(TARGET_UPDATE_KEY) as StatusPageContentModel.BaseUpdate;

        await DB.instance().delete(DB.Tables.statusUpdates).where(
            eq(DB.Tables.statusUpdates.id, update.id)
        ).run();

        return APIResponse.successNoData(c, "Update deleted successfully");
    }
);
