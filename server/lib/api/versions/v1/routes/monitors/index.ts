
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { desc, eq } from "drizzle-orm";
import { DB } from "../../../../../../db";
import { APIResponse } from "../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { AuthHandler } from "../../../../utils/authHandler";
import { MonitorsReadModel } from "./model";
import { MonitorsModel } from "../admin/monitors/model";
import { DOCS_TAGS } from "../../docs";
import { performMonitorCheck } from "../../../../../utils/monitor-checker";

const TARGET_MONITOR_KEY = "targetMonitor";

const router = new Hono().basePath('/monitors');

function requireSession(c: any): AuthHandler.SessionAuthContext | null {
    const authContext = c.get("authContext") as AuthHandler.AuthContext;
    if (authContext.type !== 'session') {
        return null;
    }
    return authContext;
}

function requireAdmin(c: any): AuthHandler.SessionAuthContext | null {
    const authContext = requireSession(c);
    if (!authContext || authContext.user_role !== 'admin') {
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

router.use("*", async (c, next) => {
    if (!requireSession(c)) {
        return APIResponse.unauthorized(c, "Authentication required");
    }
    await next();
});

router.get('/',

    APIRouteSpec.authenticated({
        summary: "List monitors",
        description: "Retrieve all configured monitors with their latest status. Members read-only; admins can also create/edit/delete.",
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

router.post('/',
    adminOnly,
    zValidator("json", MonitorsModel.Create.Body),
    APIRouteSpec.authenticated({
        summary: "Create monitor",
        description: "Create a new HTTP or TCP monitor. Admin only.",
        tags: [DOCS_TAGS.MONITORS],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Monitor created successfully", MonitorsModel.Create.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.conflict("A monitor with this name already exists")
        )
    }),
    async (c) => {
        const body = c.req.valid("json") as MonitorsModel.Create.Body;

        const duplicate = await DB.instance().select().from(DB.Tables.monitors).where(
            eq(DB.Tables.monitors.name, body.name)
        ).get();

        if (duplicate) {
            return APIResponse.conflict(c, "A monitor with this name already exists");
        }

        const created = await DB.instance().insert(DB.Tables.monitors).values({
            ...body,
            http_method: body.type === 'http' ? body.http_method : null,
            expected_http_status: body.type === 'http' ? body.expected_http_status : null,
        }).returning().get();

        await DB.instance().insert(DB.Tables.monitorStatusChecks).values({
            monitor_id: created.id,
            status: 'unknown',
        }).run();

        return APIResponse.created(c, "Monitor created successfully", created);
    }
);

router.use('/:monitorId/*',
    zValidator("param", MonitorsModel.MonitorId.Params),
    async (c, next) => {
        const { monitorId } = c.req.valid("param") as MonitorsModel.MonitorId.Params;

        const monitor = await DB.instance().select().from(DB.Tables.monitors).where(
            eq(DB.Tables.monitors.id, monitorId)
        ).get();

        if (!monitor) {
            return APIResponse.notFound(c, "Monitor not found");
        }

        c.set(TARGET_MONITOR_KEY, monitor);
        await next();
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

    async (c) => {
        const monitor = c.get(TARGET_MONITOR_KEY) as DB.Models.Monitor;

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

router.put('/:monitorId',
    adminOnly,
    zValidator("json", MonitorsModel.Update.Body),
    APIRouteSpec.authenticated({
        summary: "Update monitor",
        description: "Update an existing monitor's configuration. Admin only.",
        tags: [DOCS_TAGS.MONITORS],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Monitor updated successfully", MonitorsModel.Update.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Monitor not found"),
            APIResponseSpec.conflict("A monitor with this name already exists")
        )
    }),
    async (c) => {
        const monitor = c.get(TARGET_MONITOR_KEY) as MonitorsModel.BaseMonitor;
        const body = c.req.valid("json") as MonitorsModel.Update.Body;

        const updates = Object.fromEntries(
            Object.entries(body).filter(([, value]) => value !== undefined)
        ) as Partial<MonitorsModel.Update.Body>;

        if (Object.keys(updates).length === 0) {
            return APIResponse.badRequest(c, "Provide at least one field to update");
        }

        if (updates.name && updates.name !== monitor.name) {
            const duplicate = await DB.instance().select().from(DB.Tables.monitors).where(
                eq(DB.Tables.monitors.name, updates.name)
            ).get();
            if (duplicate) {
                return APIResponse.conflict(c, "A monitor with this name already exists");
            }
        }

        const setPayload: any = { ...updates };
        if (updates.type === 'tcp') {
            setPayload.http_method = null;
            setPayload.expected_http_status = null;
        }

        await DB.instance().update(DB.Tables.monitors).set(setPayload).where(
            eq(DB.Tables.monitors.id, monitor.id)
        ).run();

        const refreshed = await DB.instance().select().from(DB.Tables.monitors).where(
            eq(DB.Tables.monitors.id, monitor.id)
        ).get();

        if (!refreshed) {
            throw new Error("Monitor not found after update");
        }

        return APIResponse.success(c, "Monitor updated successfully", refreshed);
    }
);

router.delete('/:monitorId',
    adminOnly,
    APIRouteSpec.authenticated({
        summary: "Delete monitor",
        description: "Permanently remove a monitor and its status history. Admin only.",
        tags: [DOCS_TAGS.MONITORS],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Monitor deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Monitor not found")
        )
    }),
    async (c) => {
        const monitor = c.get(TARGET_MONITOR_KEY) as MonitorsModel.BaseMonitor;

        await DB.instance().delete(DB.Tables.monitorGroupAssignments).where(
            eq(DB.Tables.monitorGroupAssignments.monitor_id, monitor.id)
        ).run();

        await DB.instance().delete(DB.Tables.monitorStatusChecks).where(
            eq(DB.Tables.monitorStatusChecks.monitor_id, monitor.id)
        ).run();

        await DB.instance().delete(DB.Tables.monitors).where(
            eq(DB.Tables.monitors.id, monitor.id)
        ).run();

        return APIResponse.successNoData(c, "Monitor deleted successfully");
    }
);

router.post('/:monitorId/check',
    adminOnly,
    APIRouteSpec.authenticated({
        summary: "Trigger monitor check",
        description: "Run an on-demand status check for a monitor and store the result. Admin only.",
        tags: [DOCS_TAGS.MONITORS],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Monitor check completed", MonitorsModel.TriggerCheck.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Monitor not found")
        )
    }),
    async (c) => {
        const monitor = c.get(TARGET_MONITOR_KEY) as MonitorsModel.BaseMonitor;

        const result = await performMonitorCheck(monitor);

        const check = await DB.instance().insert(DB.Tables.monitorStatusChecks).values({
            monitor_id: monitor.id,
            status: result.status,
            response_time_ms: result.response_time_ms,
        }).returning().get();

        return APIResponse.success(c, "Monitor check completed", { check });
    }
);

export { router };
