import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { and, desc, eq, inArray } from "drizzle-orm";
import { DB } from "../../../../../../db";
import { APIResponse } from "../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { StatusPagesReadModel } from "./model";
import { StatusPageContentModel } from "../../models/statusPageContent";
import { DOCS_TAGS } from "../../docs";

export const router = new Hono().basePath('/public');

export async function getStatusPageConfig(): Promise<DB.Models.StatusPageConfig | undefined> {
    return DB.instance()
        .select()
        .from(DB.Tables.statusPageConfig)
        .where(eq(DB.Tables.statusPageConfig.id, 1))
        .get();
}

export async function buildPublicPageResponse(
    page: DB.Models.StatusPageConfig,
    options: { includePrivate?: boolean } = {}
): Promise<Omit<StatusPagesReadModel.GetPage.Response, 'incidents' | 'maintenance' | 'updates'>> {

    const publicOnly = !options.includePrivate;
    if (publicOnly && (!page.is_public || !page.is_enabled)) {
        throw new Error("Status page is not publicly accessible");
    }

    const groups = await DB.instance()
        .select()
        .from(DB.Tables.monitorGroups)
        .orderBy(DB.Tables.monitorGroups.sort_order);

    const links = await DB.instance()
        .select({
            link: DB.Tables.monitorGroupAssignments,
            monitor: DB.Tables.monitors,
        })
        .from(DB.Tables.monitorGroupAssignments)
        .innerJoin(DB.Tables.monitors, eq(DB.Tables.monitorGroupAssignments.monitor_id, DB.Tables.monitors.id))
        .where(
            publicOnly
                ? eq(DB.Tables.monitors.is_enabled, true)
                : undefined
        )
        .orderBy(DB.Tables.monitorGroupAssignments.sort_order);

    const monitorIds = links.map(({ monitor }) => monitor.id);

    const latestChecksByMonitor = new Map<number, DB.Models.MonitorStatusCheck>();
    if (monitorIds.length > 0) {
        const recentChecks = await DB.instance()
            .select()
            .from(DB.Tables.monitorStatusChecks)
            .where(inArray(DB.Tables.monitorStatusChecks.monitor_id, monitorIds))
            .orderBy(desc(DB.Tables.monitorStatusChecks.checked_at));

        for (const check of recentChecks) {
            if (!latestChecksByMonitor.has(check.monitor_id)) {
                latestChecksByMonitor.set(check.monitor_id, check);
            }
        }
    }

    const monitorSummary = (monitor: DB.Models.Monitor, link: DB.Models.MonitorGroupAssignment): StatusPagesReadModel.MonitorSummary => {
        const latest = latestChecksByMonitor.get(monitor.id);
        return {
            id: monitor.id,
            name: monitor.name,
            type: monitor.type,
            target: monitor.target,
            display_name: link.display_name ?? null,
            sort_order: link.sort_order,
            latest_check: latest ? {
                status: latest.status,
                response_time_ms: latest.response_time_ms ?? null,
                checked_at: latest.checked_at ?? null,
            } : null,
        };
    };

    const groupMap = new Map<number | null, StatusPagesReadModel.MonitorSummary[]>();
    for (const { link, monitor } of links) {
        const key = link.group_id ?? null;
        if (!groupMap.has(key)) {
            groupMap.set(key, []);
        }
        groupMap.get(key)!.push(monitorSummary(monitor, link));
    }

    const groupSummaries = groups.map((group: DB.Models.MonitorGroup) => ({
        id: group.id,
        name: group.name,
        sort_order: group.sort_order,
        monitors: groupMap.get(group.id) ?? [],
    }));

    return {
        page,
        groups: groupSummaries,
        ungrouped: groupMap.get(null) ?? [],
    };
}

async function fetchRecentContent(): Promise<{
    incidents: DB.Models.Incident[];
    maintenance: DB.Models.Maintenance[];
    updates: DB.Models.StatusUpdate[];
}> {
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

    return { incidents, maintenance, updates };
}

router.get('/status-page',

    APIRouteSpec.unauthenticated({
        summary: "Get public status page",
        description: "Public, unauthenticated access to the single status page.",
        tags: [DOCS_TAGS.PUBLIC_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Status page retrieved successfully", StatusPagesReadModel.GetPage.Response),
            APIResponseSpec.notFound("Status page not found or not public")
        )
    }),

    async (c) => {
        const page = await getStatusPageConfig();

        if (!page || !page.is_public || !page.is_enabled) {
            return APIResponse.notFound(c, "Status page not found or not public");
        }

        const response = await buildPublicPageResponse(page);
        const content = await fetchRecentContent();

        return APIResponse.success(c, "Status page retrieved successfully", {
            ...response,
            ...content,
        });
    }
);

router.get('/status-page/incidents',

    APIRouteSpec.unauthenticated({
        summary: "Get public incidents",
        description: "List public incidents for the status page.",
        tags: [DOCS_TAGS.PUBLIC_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Incidents retrieved successfully", StatusPageContentModel.Lists.Incidents),
            APIResponseSpec.notFound("Status page not found or not public")
        )
    }),

    async (c) => {
        const page = await getStatusPageConfig();

        if (!page || !page.is_public || !page.is_enabled) {
            return APIResponse.notFound(c, "Status page not found or not public");
        }

        const incidents = await DB.instance()
            .select()
            .from(DB.Tables.incidents)
            .orderBy(desc(DB.Tables.incidents.started_at));

        return APIResponse.success(c, "Incidents retrieved successfully", incidents);
    }
);

router.get('/status-page/maintenance',

    APIRouteSpec.unauthenticated({
        summary: "Get public maintenance",
        description: "List public scheduled maintenance entries for the status page.",
        tags: [DOCS_TAGS.PUBLIC_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Maintenance retrieved successfully", StatusPageContentModel.Lists.Maintenance),
            APIResponseSpec.notFound("Status page not found or not public")
        )
    }),

    async (c) => {
        const page = await getStatusPageConfig();

        if (!page || !page.is_public || !page.is_enabled) {
            return APIResponse.notFound(c, "Status page not found or not public");
        }

        const maintenance = await DB.instance()
            .select()
            .from(DB.Tables.maintenance)
            .orderBy(desc(DB.Tables.maintenance.scheduled_start_at));

        return APIResponse.success(c, "Maintenance retrieved successfully", maintenance);
    }
);

router.get('/status-page/updates',

    APIRouteSpec.unauthenticated({
        summary: "Get public updates",
        description: "List public updates for the status page.",
        tags: [DOCS_TAGS.PUBLIC_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Updates retrieved successfully", StatusPageContentModel.Lists.Updates),
            APIResponseSpec.notFound("Status page not found or not public")
        )
    }),

    async (c) => {
        const page = await getStatusPageConfig();

        if (!page || !page.is_public || !page.is_enabled) {
            return APIResponse.notFound(c, "Status page not found or not public");
        }

        const updates = await DB.instance()
            .select()
            .from(DB.Tables.statusUpdates)
            .orderBy(desc(DB.Tables.statusUpdates.created_at));

        return APIResponse.success(c, "Updates retrieved successfully", updates);
    }
);

router.get('/monitors/:monitorId',

    APIRouteSpec.unauthenticated({
        summary: "Get public monitor",
        description: "Public view of a single monitor, only if it is linked to the status page.",
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

        const link = await DB.instance()
            .select()
            .from(DB.Tables.monitorGroupAssignments)
            .where(eq(DB.Tables.monitorGroupAssignments.monitor_id, monitor.id))
            .limit(1)
            .get();

        if (!link) {
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
