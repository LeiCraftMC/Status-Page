import { Hono } from "hono";
import { desc } from "drizzle-orm";
import { DB } from "../../../../../../db";
import { APIResponse } from "../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { AuthHandler } from "../../../../utils/authHandler";
import { StatusPagesReadModel } from "./model";
import { buildPublicPageResponse, getStatusPageConfig } from "./public";
import { StatusPageContentModel } from "../../models/statusPageContent";
import { DOCS_TAGS } from "../../docs";

export const router = new Hono().basePath('/status-page');

router.use("*", async (c, next) => {
    // @ts-ignore
    const authContext = c.get("authContext") as AuthHandler.AuthContext;

    if (authContext.type !== 'session') {
        return APIResponse.unauthorized(c, "Authentication required");
    }

    await next();
});

router.get('/',

    APIRouteSpec.authenticated({
        summary: "Get status page",
        description: "Retrieve the single status page with its groups, linked monitors, and recent content. Members can read this regardless of the public flag.",
        tags: [DOCS_TAGS.STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Status page retrieved successfully", StatusPagesReadModel.GetPage.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    async (c) => {
        const page = await getStatusPageConfig();

        if (!page) {
            return APIResponse.notFound(c, "Status page not found");
        }

        const response = await buildPublicPageResponse(page, { includePrivate: true });

        const incidents = await DB.instance()
            .select()
            .from(DB.Tables.incidents)
            .orderBy(desc(DB.Tables.incidents.started_at));

        const maintenance = await DB.instance()
            .select()
            .from(DB.Tables.maintenance)
            .orderBy(desc(DB.Tables.maintenance.scheduled_start_at));

        const updates = await DB.instance()
            .select()
            .from(DB.Tables.statusUpdates)
            .orderBy(desc(DB.Tables.statusUpdates.created_at));

        return APIResponse.success(c, "Status page retrieved successfully", {
            ...response,
            incidents,
            maintenance,
            updates,
        });
    }
);

router.get('/incidents',

    APIRouteSpec.authenticated({
        summary: "List incidents",
        description: "Retrieve all incidents for the status page (member read-only).",
        tags: [DOCS_TAGS.STATUS_PAGES],

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

        return APIResponse.success(c, "Incidents retrieved successfully", incidents);
    }
);

router.get('/maintenance',

    APIRouteSpec.authenticated({
        summary: "List maintenance",
        description: "Retrieve all scheduled maintenance entries for the status page (member read-only).",
        tags: [DOCS_TAGS.STATUS_PAGES],

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

        return APIResponse.success(c, "Maintenance retrieved successfully", maintenance);
    }
);

router.get('/updates',

    APIRouteSpec.authenticated({
        summary: "List updates",
        description: "Retrieve all updates for the status page (member read-only).",
        tags: [DOCS_TAGS.STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Updates retrieved successfully", StatusPageContentModel.Lists.Updates),
            APIResponseSpec.unauthorized("Authentication required")
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
