import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { desc, eq } from "drizzle-orm";
import { DB } from "../../../../../../db";
import { APIResponse } from "../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { AuthHandler } from "../../../../utils/authHandler";
import { MonitorsReadModel } from "./model";
import { DOCS_TAGS } from "../../docs";

export const router = new Hono().basePath('/monitors');

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
        summary: "List enabled monitors",
        description: "Retrieve all enabled monitors with their latest status.",
        tags: [DOCS_TAGS.MONITORS],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Monitors retrieved successfully", MonitorsReadModel.GetAll.Response),
            APIResponseSpec.unauthorized("Authentication required")
        )
    }),

    async (c) => {
        const monitors = await DB.instance()
            .select()
            .from(DB.Tables.monitors)
            .orderBy(DB.Tables.monitors.id);

        const enriched = await Promise.all(monitors.map(async (monitor: DB.Models.Monitor) => {
            const latest = await DB.instance()
                .select()
                .from(DB.Tables.monitorStatusChecks)
                .where(eq(DB.Tables.monitorStatusChecks.monitor_id, monitor.id))
                .orderBy(desc(DB.Tables.monitorStatusChecks.checked_at))
                .limit(1)
                .get();

            return {
                ...monitor,
                latest_check: latest ? {
                    status: latest.status,
                    response_time_ms: latest.response_time_ms ?? null,
                    checked_at: latest.checked_at ?? null,
                } : null,
            };
        }));

        return APIResponse.success(c, "Monitors retrieved successfully", enriched);
    }
);

router.get('/:monitorId',

    APIRouteSpec.authenticated({
        summary: "Get monitor details",
        description: "Retrieve a monitor and its recent status checks.",
        tags: [DOCS_TAGS.MONITORS],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Monitor retrieved successfully", MonitorsReadModel.GetOne.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.notFound("Monitor not found")
        )
    }),

    zValidator("param", MonitorsReadModel.GetOne.Params),

    async (c) => {
        const { monitorId } = c.req.valid("param") as MonitorsReadModel.GetOne.Params;

        const monitor = await DB.instance().select().from(DB.Tables.monitors).where(
            eq(DB.Tables.monitors.id, monitorId)
        ).get();

        if (!monitor) {
            return APIResponse.notFound(c, "Monitor not found");
        }

        const latest = await DB.instance()
            .select()
            .from(DB.Tables.monitorStatusChecks)
            .where(eq(DB.Tables.monitorStatusChecks.monitor_id, monitor.id))
            .orderBy(desc(DB.Tables.monitorStatusChecks.checked_at))
            .limit(1)
            .get();

        const recentChecks = await DB.instance()
            .select()
            .from(DB.Tables.monitorStatusChecks)
            .where(eq(DB.Tables.monitorStatusChecks.monitor_id, monitor.id))
            .orderBy(desc(DB.Tables.monitorStatusChecks.checked_at))
            .limit(50);

        return APIResponse.success(c, "Monitor retrieved successfully", {
            ...monitor,
            latest_check: latest ? {
                status: latest.status,
                response_time_ms: latest.response_time_ms ?? null,
                checked_at: latest.checked_at ?? null,
            } : null,
            recent_checks: recentChecks,
        });
    }
);
