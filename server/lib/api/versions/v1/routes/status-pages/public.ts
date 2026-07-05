import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { and, desc, eq } from "drizzle-orm";
import { DB } from "../../../../../../db";
import { APIResponse } from "../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { StatusPagesReadModel } from "./model";
import { StatusPageContentModel } from "./content/model";
import { buildPublicPageResponse, isMonitorPublic } from "./shared";
import { getSettings } from "../admin/settings";
import { DOCS_TAGS } from "../../docs";

export const router = new Hono().basePath('/public');

router.get('/status-pages/root',

    APIRouteSpec.unauthenticated({
        summary: "Get root status page",
        description: "Retrieve the status page configured as the root page. Returns 404 if none is configured.",
        tags: [DOCS_TAGS.PUBLIC_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Root status page retrieved successfully", StatusPagesReadModel.GetRoot.Response),
            APIResponseSpec.notFound("No root status page configured")
        )
    }),

    async (c) => {
        const settings = await getSettings();

        if (!settings.root_status_page_id) {
            return APIResponse.notFound(c, "No root status page configured");
        }

        const page = await DB.instance().select().from(DB.Tables.statusPages).where(
            and(
                eq(DB.Tables.statusPages.id, settings.root_status_page_id),
                eq(DB.Tables.statusPages.is_enabled, true)
            )
        ).get();

        if (!page) {
            return APIResponse.notFound(c, "No root status page configured");
        }

        const response = await buildPublicPageResponse(page);
        return APIResponse.success(c, "Root status page retrieved successfully", response);
    }
);

router.get('/status-pages/:slug/incidents',

    APIRouteSpec.unauthenticated({
        summary: "Get public incidents",
        description: "List public incidents for a status page.",
        tags: [DOCS_TAGS.PUBLIC_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Incidents retrieved successfully", StatusPageContentModel.Lists.Incidents),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    zValidator("param", StatusPagesReadModel.GetBySlug.Params),

    async (c) => {
        const { slug } = c.req.valid("param") as StatusPagesReadModel.GetBySlug.Params;

        const page = await DB.instance().select().from(DB.Tables.statusPages).where(
            and(
                eq(DB.Tables.statusPages.slug, slug),
                eq(DB.Tables.statusPages.is_public, true),
                eq(DB.Tables.statusPages.is_enabled, true)
            )
        ).get();

        if (!page) {
            return APIResponse.notFound(c, "Status page not found");
        }

        const incidents = await DB.instance()
            .select()
            .from(DB.Tables.statusPageIncidents)
            .where(eq(DB.Tables.statusPageIncidents.status_page_id, page.id))
            .orderBy(desc(DB.Tables.statusPageIncidents.started_at));

        return APIResponse.success(c, "Incidents retrieved successfully", incidents);
    }
);

router.get('/status-pages/:slug/maintenance',

    APIRouteSpec.unauthenticated({
        summary: "Get public maintenance",
        description: "List public scheduled maintenance entries for a status page.",
        tags: [DOCS_TAGS.PUBLIC_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Maintenance retrieved successfully", StatusPageContentModel.Lists.Maintenance),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    zValidator("param", StatusPagesReadModel.GetBySlug.Params),

    async (c) => {
        const { slug } = c.req.valid("param") as StatusPagesReadModel.GetBySlug.Params;

        const page = await DB.instance().select().from(DB.Tables.statusPages).where(
            and(
                eq(DB.Tables.statusPages.slug, slug),
                eq(DB.Tables.statusPages.is_public, true),
                eq(DB.Tables.statusPages.is_enabled, true)
            )
        ).get();

        if (!page) {
            return APIResponse.notFound(c, "Status page not found");
        }

        const maintenance = await DB.instance()
            .select()
            .from(DB.Tables.statusPageMaintenance)
            .where(eq(DB.Tables.statusPageMaintenance.status_page_id, page.id))
            .orderBy(desc(DB.Tables.statusPageMaintenance.scheduled_start_at));

        return APIResponse.success(c, "Maintenance retrieved successfully", maintenance);
    }
);

router.get('/status-pages/:slug/updates',

    APIRouteSpec.unauthenticated({
        summary: "Get public updates",
        description: "List public updates for a status page.",
        tags: [DOCS_TAGS.PUBLIC_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Updates retrieved successfully", StatusPageContentModel.Lists.Updates),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    zValidator("param", StatusPagesReadModel.GetBySlug.Params),

    async (c) => {
        const { slug } = c.req.valid("param") as StatusPagesReadModel.GetBySlug.Params;

        const page = await DB.instance().select().from(DB.Tables.statusPages).where(
            and(
                eq(DB.Tables.statusPages.slug, slug),
                eq(DB.Tables.statusPages.is_public, true),
                eq(DB.Tables.statusPages.is_enabled, true)
            )
        ).get();

        if (!page) {
            return APIResponse.notFound(c, "Status page not found");
        }

        const updates = await DB.instance()
            .select()
            .from(DB.Tables.statusPageUpdates)
            .where(eq(DB.Tables.statusPageUpdates.status_page_id, page.id))
            .orderBy(desc(DB.Tables.statusPageUpdates.created_at));

        return APIResponse.success(c, "Updates retrieved successfully", updates);
    }
);

router.get('/status-pages/:slug',

    APIRouteSpec.unauthenticated({
        summary: "Get public status page",
        description: "Public, unauthenticated access to a status page by slug.",
        tags: [DOCS_TAGS.PUBLIC_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Status page retrieved successfully", StatusPagesReadModel.GetBySlug.Response),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    zValidator("param", StatusPagesReadModel.GetBySlug.Params),

    async (c) => {
        const { slug } = c.req.valid("param") as StatusPagesReadModel.GetBySlug.Params;

        const page = await DB.instance().select().from(DB.Tables.statusPages).where(
            and(
                eq(DB.Tables.statusPages.slug, slug),
                eq(DB.Tables.statusPages.is_public, true),
                eq(DB.Tables.statusPages.is_enabled, true)
            )
        ).get();

        if (!page) {
            return APIResponse.notFound(c, "Status page not found");
        }

        const response = await buildPublicPageResponse(page);
        return APIResponse.success(c, "Status page retrieved successfully", response);
    }
);

router.get('/monitors/:monitorId',

    APIRouteSpec.unauthenticated({
        summary: "Get public monitor",
        description: "Public view of a single monitor, only if it is linked to a public status page.",
        tags: [DOCS_TAGS.PUBLIC_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Monitor retrieved successfully", StatusPagesReadModel.GetPublicMonitor.Response),
            APIResponseSpec.notFound("Monitor not found or not publicly visible")
        )
    }),

    zValidator("param", StatusPagesReadModel.GetPublicMonitor.Params),

    async (c) => {
        const { monitorId } = c.req.valid("param") as StatusPagesReadModel.GetPublicMonitor.Params;

        const monitor = await DB.instance().select().from(DB.Tables.monitors).where(
            and(
                eq(DB.Tables.monitors.id, monitorId),
                eq(DB.Tables.monitors.is_enabled, true)
            )
        ).get();

        if (!monitor) {
            return APIResponse.notFound(c, "Monitor not found or not publicly visible");
        }

        if (!(await isMonitorPublic(monitor.id))) {
            return APIResponse.notFound(c, "Monitor not found or not publicly visible");
        }

        const latest = await DB.instance()
            .select()
            .from(DB.Tables.monitorStatusChecks)
            .where(eq(DB.Tables.monitorStatusChecks.monitor_id, monitor.id))
            .orderBy(desc(DB.Tables.monitorStatusChecks.checked_at))
            .limit(1)
            .get();

        return APIResponse.success(c, "Monitor retrieved successfully", {
            monitor,
            latest_check: latest ?? null,
        });
    }
);
