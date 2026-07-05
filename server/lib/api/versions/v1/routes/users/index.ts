import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { like, or } from "drizzle-orm";
import { DB } from "../../../../../../db";
import { APIResponse } from "../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { AuthHandler } from "../../../../utils/authHandler";
import { UsersPublicModel } from "./model";
import { DOCS_TAGS } from "../../docs";

const SEARCH_RESULT_LIMIT = 25;

export const router = new Hono().basePath('/users');

// Public user search is available to any authenticated user (not admin-only).
router.use("*", async (c, next) => {
    // @ts-ignore
    const authContext = c.get("authContext") as AuthHandler.AuthContext;

    if (authContext.type !== 'session') {
        return APIResponse.unauthorized(c, "Authentication required");
    }

    await next();
});

router.get('/search',

    APIRouteSpec.authenticated({
        summary: "Search users",
        description: "Find other users by username or display name. Returns public profile fields only.",
        tags: [DOCS_TAGS.USERS],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Users retrieved successfully", UsersPublicModel.Search.Response),
            APIResponseSpec.unauthorized("Authentication required")
        )
    }),

    zValidator("query", UsersPublicModel.Search.Query),

    async (c) => {
        const { q } = c.req.valid("query") as UsersPublicModel.Search.Query;

        const pattern = `%${q}%`;

        const users = await DB.instance()
            .select({
                id: DB.Tables.users.id,
                username: DB.Tables.users.username,
                display_name: DB.Tables.users.display_name,
            })
            .from(DB.Tables.users)
            .where(or(
                like(DB.Tables.users.username, pattern),
                like(DB.Tables.users.display_name, pattern),
            ))
            .orderBy(DB.Tables.users.username)
            .limit(SEARCH_RESULT_LIMIT);

        return APIResponse.success(c, "Users retrieved successfully", users);
    }
);
