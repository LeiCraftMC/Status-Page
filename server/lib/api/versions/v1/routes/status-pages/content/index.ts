import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { desc, eq } from "drizzle-orm";
import { DB } from "../../../../../../../db";
import { APIResponse } from "../../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { AuthHandler } from "../../../../../utils/authHandler";
import { StatusPageContentModel } from "./model";
import { DOCS_TAGS } from "../../../docs";

const TARGET_INCIDENT_KEY = "targetIncident";
const TARGET_MAINTENANCE_KEY = "targetMaintenance";
const TARGET_UPDATE_KEY = "targetUpdate";

function requireSession(c: any): AuthHandler.SessionAuthContext | null {
    const authContext = c.get("authContext") as AuthHandler.AuthContext;
    if (authContext.type !== 'session') {
        return null;
    }
    return authContext;
}

export const router = new Hono();

router.use("*", async (c, next) => {
    const authContext = requireSession(c);
    if (!authContext) {
        return APIResponse.unauthorized(c, "Authentication required");
    }
    await next();
});

// @ts-ignore
router.use('/:slug/*',
    zValidator("param", StatusPageContentModel.SlugParams.Params),

    async (c, next) => {
        // @ts-ignore
        const { slug } = c.req.valid("param") as StatusPageContentModel.SlugParams.Params;

        const page = await DB.instance().select().from(DB.Tables.statusPages).where(
            eq(DB.Tables.statusPages.slug, slug)
        ).get();

        if (!page) {
            return APIResponse.notFound(c, "Status page not found");
        }

        // @ts-ignore
        c.set("targetStatusPage", page);
        await next();
    }
);

// Incidents

router.get('/:slug/incidents',

    APIRouteSpec.authenticated({
        summary: "List incidents",
        description: "Retrieve all incidents for a status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Incidents retrieved successfully", StatusPageContentModel.Lists.Incidents),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const page = c.get("targetStatusPage") as DB.Models.StatusPage;

        const incidents = await DB.instance()
            .select()
            .from(DB.Tables.statusPageIncidents)
            .where(eq(DB.Tables.statusPageIncidents.status_page_id, page.id))
            .orderBy(desc(DB.Tables.statusPageIncidents.started_at));

        return APIResponse.success(c, "Incidents retrieved successfully", incidents);
    }
);

router.post('/:slug/incidents',

    APIRouteSpec.authenticated({
        summary: "Create incident",
        description: "Post a new incident to a status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Incident created successfully", StatusPageContentModel.BaseIncident),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    zValidator("json", StatusPageContentModel.IncidentId.Body),

    async (c) => {
        // @ts-ignore
        const page = c.get("targetStatusPage") as DB.Models.StatusPage;
        const body = c.req.valid("json") as StatusPageContentModel.IncidentId.Body;

        const now = Date.now();
        const created = await DB.instance().insert(DB.Tables.statusPageIncidents).values({
            status_page_id: page.id,
            ...body,
            started_at: now,
            updated_at: now,
        }).returning().get();

        return APIResponse.created(c, "Incident created successfully", created);
    }
);

// @ts-ignore
router.use('/:slug/incidents/:incidentId/*',
    zValidator("param", StatusPageContentModel.IncidentId.Params),

    async (c, next) => {
        // @ts-ignore
        const { slug, incidentId } = c.req.valid("param") as StatusPageContentModel.IncidentId.Params;

        const incident = await DB.instance().select().from(DB.Tables.statusPageIncidents).where(
            eq(DB.Tables.statusPageIncidents.id, incidentId)
        ).get();

        if (!incident || incident.status_page_id !== pageIdForSlug(c, slug)) {
            return APIResponse.notFound(c, "Incident not found");
        }

        // @ts-ignore
        c.set(TARGET_INCIDENT_KEY, incident);
        await next();
    }
);

router.put('/:slug/incidents/:incidentId',

    APIRouteSpec.authenticated({
        summary: "Update incident",
        description: "Update an incident's status, severity, or message.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Incident updated successfully", StatusPageContentModel.BaseIncident),
            APIResponseSpec.unauthorized("Authentication required"),
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

        await DB.instance().update(DB.Tables.statusPageIncidents).set(updates).where(
            eq(DB.Tables.statusPageIncidents.id, incident.id)
        ).run();

        const refreshed = await DB.instance().select().from(DB.Tables.statusPageIncidents).where(
            eq(DB.Tables.statusPageIncidents.id, incident.id)
        ).get();

        if (!refreshed) {
            throw new Error("Incident not found after update");
        }

        return APIResponse.success(c, "Incident updated successfully", refreshed);
    }
);

router.delete('/:slug/incidents/:incidentId',

    APIRouteSpec.authenticated({
        summary: "Delete incident",
        description: "Remove an incident from a status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Incident deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Incident not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const incident = c.get(TARGET_INCIDENT_KEY) as StatusPageContentModel.BaseIncident;

        await DB.instance().delete(DB.Tables.statusPageIncidents).where(
            eq(DB.Tables.statusPageIncidents.id, incident.id)
        ).run();

        return APIResponse.successNoData(c, "Incident deleted successfully");
    }
);

// Maintenance

router.get('/:slug/maintenance',

    APIRouteSpec.authenticated({
        summary: "List maintenance",
        description: "Retrieve all scheduled maintenance entries for a status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Maintenance retrieved successfully", StatusPageContentModel.Lists.Maintenance),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const page = c.get("targetStatusPage") as DB.Models.StatusPage;

        const maintenance = await DB.instance()
            .select()
            .from(DB.Tables.statusPageMaintenance)
            .where(eq(DB.Tables.statusPageMaintenance.status_page_id, page.id))
            .orderBy(desc(DB.Tables.statusPageMaintenance.scheduled_start_at));

        return APIResponse.success(c, "Maintenance retrieved successfully", maintenance);
    }
);

router.post('/:slug/maintenance',

    APIRouteSpec.authenticated({
        summary: "Create maintenance",
        description: "Post a new scheduled maintenance entry to a status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Maintenance created successfully", StatusPageContentModel.BaseMaintenance),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    zValidator("json", StatusPageContentModel.MaintenanceId.Body),

    async (c) => {
        // @ts-ignore
        const page = c.get("targetStatusPage") as DB.Models.StatusPage;
        const body = c.req.valid("json") as StatusPageContentModel.MaintenanceId.Body;

        const now = Date.now();
        const created = await DB.instance().insert(DB.Tables.statusPageMaintenance).values({
            status_page_id: page.id,
            ...body,
            created_at: now,
            updated_at: now,
        }).returning().get();

        return APIResponse.created(c, "Maintenance created successfully", created);
    }
);

// @ts-ignore
router.use('/:slug/maintenance/:maintenanceId/*',
    zValidator("param", StatusPageContentModel.MaintenanceId.Params),

    async (c, next) => {
        // @ts-ignore
        const { slug, maintenanceId } = c.req.valid("param") as StatusPageContentModel.MaintenanceId.Params;

        const maintenance = await DB.instance().select().from(DB.Tables.statusPageMaintenance).where(
            eq(DB.Tables.statusPageMaintenance.id, maintenanceId)
        ).get();

        if (!maintenance || maintenance.status_page_id !== pageIdForSlug(c, slug)) {
            return APIResponse.notFound(c, "Maintenance not found");
        }

        // @ts-ignore
        c.set(TARGET_MAINTENANCE_KEY, maintenance);
        await next();
    }
);

router.put('/:slug/maintenance/:maintenanceId',

    APIRouteSpec.authenticated({
        summary: "Update maintenance",
        description: "Update a scheduled maintenance entry.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Maintenance updated successfully", StatusPageContentModel.BaseMaintenance),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Maintenance not found")
        )
    }),

    zValidator("json", StatusPageContentModel.MaintenanceId.UpdateBody),

    async (c) => {
        // @ts-ignore
        const maintenance = c.get(TARGET_MAINTENANCE_KEY) as StatusPageContentModel.BaseMaintenance;
        const body = c.req.valid("json") as StatusPageContentModel.MaintenanceId.UpdateBody;

        await DB.instance().update(DB.Tables.statusPageMaintenance).set({
            ...body,
            updated_at: Date.now(),
        }).where(
            eq(DB.Tables.statusPageMaintenance.id, maintenance.id)
        ).run();

        const refreshed = await DB.instance().select().from(DB.Tables.statusPageMaintenance).where(
            eq(DB.Tables.statusPageMaintenance.id, maintenance.id)
        ).get();

        if (!refreshed) {
            throw new Error("Maintenance not found after update");
        }

        return APIResponse.success(c, "Maintenance updated successfully", refreshed);
    }
);

router.delete('/:slug/maintenance/:maintenanceId',

    APIRouteSpec.authenticated({
        summary: "Delete maintenance",
        description: "Remove a scheduled maintenance entry.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Maintenance deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Maintenance not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const maintenance = c.get(TARGET_MAINTENANCE_KEY) as StatusPageContentModel.BaseMaintenance;

        await DB.instance().delete(DB.Tables.statusPageMaintenance).where(
            eq(DB.Tables.statusPageMaintenance.id, maintenance.id)
        ).run();

        return APIResponse.successNoData(c, "Maintenance deleted successfully");
    }
);

// Updates

router.get('/:slug/updates',

    APIRouteSpec.authenticated({
        summary: "List updates",
        description: "Retrieve all general updates for a status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Updates retrieved successfully", StatusPageContentModel.Lists.Updates),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const page = c.get("targetStatusPage") as DB.Models.StatusPage;

        const updates = await DB.instance()
            .select()
            .from(DB.Tables.statusPageUpdates)
            .where(eq(DB.Tables.statusPageUpdates.status_page_id, page.id))
            .orderBy(desc(DB.Tables.statusPageUpdates.created_at));

        return APIResponse.success(c, "Updates retrieved successfully", updates);
    }
);

router.post('/:slug/updates',

    APIRouteSpec.authenticated({
        summary: "Create update",
        description: "Post a new update to a status page.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Update created successfully", StatusPageContentModel.BaseUpdate),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    zValidator("json", StatusPageContentModel.UpdateId.Body),

    async (c) => {
        // @ts-ignore
        const page = c.get("targetStatusPage") as DB.Models.StatusPage;
        const body = c.req.valid("json") as StatusPageContentModel.UpdateId.Body;

        const now = Date.now();
        const created = await DB.instance().insert(DB.Tables.statusPageUpdates).values({
            status_page_id: page.id,
            ...body,
            created_at: now,
            updated_at: now,
        }).returning().get();

        return APIResponse.created(c, "Update created successfully", created);
    }
);

// @ts-ignore
router.use('/:slug/updates/:updateId/*',
    zValidator("param", StatusPageContentModel.UpdateId.Params),

    async (c, next) => {
        // @ts-ignore
        const { slug, updateId } = c.req.valid("param") as StatusPageContentModel.UpdateId.Params;

        const update = await DB.instance().select().from(DB.Tables.statusPageUpdates).where(
            eq(DB.Tables.statusPageUpdates.id, updateId)
        ).get();

        if (!update || update.status_page_id !== pageIdForSlug(c, slug)) {
            return APIResponse.notFound(c, "Update not found");
        }

        // @ts-ignore
        c.set(TARGET_UPDATE_KEY, update);
        await next();
    }
);

router.put('/:slug/updates/:updateId',

    APIRouteSpec.authenticated({
        summary: "Update update",
        description: "Update a status page update.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Update updated successfully", StatusPageContentModel.BaseUpdate),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Update not found")
        )
    }),

    zValidator("json", StatusPageContentModel.UpdateId.UpdateBody),

    async (c) => {
        // @ts-ignore
        const update = c.get(TARGET_UPDATE_KEY) as StatusPageContentModel.BaseUpdate;
        const body = c.req.valid("json") as StatusPageContentModel.UpdateId.UpdateBody;

        await DB.instance().update(DB.Tables.statusPageUpdates).set({
            ...body,
            updated_at: Date.now(),
        }).where(
            eq(DB.Tables.statusPageUpdates.id, update.id)
        ).run();

        const refreshed = await DB.instance().select().from(DB.Tables.statusPageUpdates).where(
            eq(DB.Tables.statusPageUpdates.id, update.id)
        ).get();

        if (!refreshed) {
            throw new Error("Update not found after update");
        }

        return APIResponse.success(c, "Update updated successfully", refreshed);
    }
);

router.delete('/:slug/updates/:updateId',

    APIRouteSpec.authenticated({
        summary: "Delete update",
        description: "Remove a status page update.",
        tags: [DOCS_TAGS.STATUS_PAGE_CONTENT],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Update deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Update not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const update = c.get(TARGET_UPDATE_KEY) as StatusPageContentModel.BaseUpdate;

        await DB.instance().delete(DB.Tables.statusPageUpdates).where(
            eq(DB.Tables.statusPageUpdates.id, update.id)
        ).run();

        return APIResponse.successNoData(c, "Update deleted successfully");
    }
);

function pageIdForSlug(c: any, slug: string): number {
    const page = c.get("targetStatusPage") as DB.Models.StatusPage | undefined;
    return page?.id ?? -1;
}
