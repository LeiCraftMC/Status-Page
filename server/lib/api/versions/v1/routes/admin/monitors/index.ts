import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { and, desc, eq } from "drizzle-orm";
import { DB } from "../../../../../../../db";
import { APIResponse } from "../../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { MonitorsModel } from "./model";
import { DOCS_TAGS } from "../../../docs";
import { performMonitorCheck } from "../../../../../../../utils/monitor-checker";

const TARGET_MONITOR_KEY = "targetMonitor";

export const router = new Hono().basePath('/monitors');

router.get('/',

    APIRouteSpec.authenticated({
        summary: "List monitors",
        description: "Retrieve all configured monitors, including disabled ones.",
        tags: [DOCS_TAGS.ADMIN_MONITORS],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Monitors retrieved successfully", MonitorsModel.GetAll.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    async (c) => {
        const monitors = await DB.instance()
            .select()
            .from(DB.Tables.monitors)
            .orderBy(DB.Tables.monitors.id);

        return APIResponse.success(c, "Monitors retrieved successfully", monitors);
    }
);

router.post('/',

    APIRouteSpec.authenticated({
        summary: "Create monitor",
        description: "Create a new HTTP or TCP monitor.",
        tags: [DOCS_TAGS.ADMIN_MONITORS],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Monitor created successfully", MonitorsModel.Create.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.conflict("A monitor with this name already exists")
        )
    }),

    zValidator("json", MonitorsModel.Create.Body),

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

        // Seed an initial unknown status so read APIs have data to display.
        await DB.instance().insert(DB.Tables.monitorStatusChecks).values({
            monitor_id: created.id,
            status: 'unknown',
        }).run();

        return APIResponse.created(c, "Monitor created successfully", created);
    }
);

// @ts-ignore
router.use('/:monitorId/*',

    zValidator("param", MonitorsModel.MonitorId.Params),

    async (c, next) => {
        // @ts-ignore
        const { monitorId } = c.req.valid("param") as MonitorsModel.MonitorId.Params;

        const monitor = await DB.instance().select().from(DB.Tables.monitors).where(
            eq(DB.Tables.monitors.id, monitorId)
        ).get();

        if (!monitor) {
            return APIResponse.notFound(c, "Monitor not found");
        }

        // @ts-ignore
        c.set(TARGET_MONITOR_KEY, monitor);

        await next();
    }
);

router.get('/:monitorId',

    APIRouteSpec.authenticated({
        summary: "Get monitor",
        description: "Retrieve a single monitor and its latest status checks.",
        tags: [DOCS_TAGS.ADMIN_MONITORS],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Monitor retrieved successfully", MonitorsModel.BaseMonitor),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Monitor not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const monitor = c.get(TARGET_MONITOR_KEY) as MonitorsModel.BaseMonitor;
        return APIResponse.success(c, "Monitor retrieved successfully", monitor);
    }
);

router.put('/:monitorId',

    APIRouteSpec.authenticated({
        summary: "Update monitor",
        description: "Update an existing monitor's configuration.",
        tags: [DOCS_TAGS.ADMIN_MONITORS],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Monitor updated successfully", MonitorsModel.Update.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Monitor not found"),
            APIResponseSpec.conflict("A monitor with this name already exists")
        )
    }),

    zValidator("json", MonitorsModel.Update.Body),

    async (c) => {
        // @ts-ignore
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

    APIRouteSpec.authenticated({
        summary: "Delete monitor",
        description: "Permanently remove a monitor and its status history.",
        tags: [DOCS_TAGS.ADMIN_MONITORS],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Monitor deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Monitor not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const monitor = c.get(TARGET_MONITOR_KEY) as MonitorsModel.BaseMonitor;

        await DB.instance().delete(DB.Tables.statusPageMonitorLinks).where(
            eq(DB.Tables.statusPageMonitorLinks.monitor_id, monitor.id)
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

    APIRouteSpec.authenticated({
        summary: "Trigger monitor check",
        description: "Run an on-demand status check for a monitor and store the result.",
        tags: [DOCS_TAGS.ADMIN_MONITORS],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Monitor check completed", MonitorsModel.TriggerCheck.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Monitor not found")
        )
    }),

    async (c) => {
        // @ts-ignore
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

