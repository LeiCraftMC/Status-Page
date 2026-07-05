import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { eq } from "drizzle-orm";
import { DB } from "../../../../../../db";
import { APIResponse } from "../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { AuthHandler } from "../../../../utils/authHandler";
import { StatusPagesReadModel } from "./model";
import { DOCS_TAGS } from "../../docs";
import { buildFullPage } from "../admin/status-pages";
import { router as contentRouter } from "./content";

export const router = new Hono().basePath('/status-pages');

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
        summary: "List status pages",
        description: "Retrieve all status pages, including disabled or private ones.",
        tags: [DOCS_TAGS.STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Status pages retrieved successfully", StatusPagesReadModel.GetAll.Response),
            APIResponseSpec.unauthorized("Authentication required")
        )
    }),

    async (c) => {
        const pages = await DB.instance()
            .select()
            .from(DB.Tables.statusPages)
            .orderBy(DB.Tables.statusPages.id);

        return APIResponse.success(c, "Status pages retrieved successfully", pages);
    }
);

router.route('/', contentRouter);

router.get('/:slug',

    APIRouteSpec.authenticated({
        summary: "Get status page by slug",
        description: "Retrieve a status page with its groups and linked monitors.",
        tags: [DOCS_TAGS.STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Status page retrieved successfully", StatusPagesReadModel.FullPage.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    zValidator("param", StatusPagesReadModel.GetBySlug.Params),

    async (c) => {
        // @ts-ignore
        const { slug } = c.req.valid("param") as StatusPagesReadModel.GetBySlug.Params;

        const page = await DB.instance().select().from(DB.Tables.statusPages).where(
            eq(DB.Tables.statusPages.slug, slug)
        ).get();

        if (!page) {
            return APIResponse.notFound(c, "Status page not found");
        }

        const full = await buildFullPage(page);
        return APIResponse.success(c, "Status page retrieved successfully", full);
    }
);
