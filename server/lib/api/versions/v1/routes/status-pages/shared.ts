import { and, desc, eq, inArray } from "drizzle-orm";
import { DB } from "../../../../../../db";
import { StatusPagesReadModel } from "./model";

export async function buildPublicPageResponse(page: StatusPagesReadModel.BasePage): Promise<StatusPagesReadModel.GetBySlug.Response> {
    const groups = await DB.instance()
        .select()
        .from(DB.Tables.statusPageGroups)
        .where(eq(DB.Tables.statusPageGroups.status_page_id, page.id))
        .orderBy(DB.Tables.statusPageGroups.sort_order);

    const links = await DB.instance()
        .select({
            link: DB.Tables.statusPageMonitorLinks,
            monitor: DB.Tables.monitors,
        })
        // @ts-ignore
        .from(DB.Tables.statusPageMonitorLinks)
        .innerJoin(DB.Tables.monitors, eq(DB.Tables.statusPageMonitorLinks.monitor_id, DB.Tables.monitors.id))
        .where(eq(DB.Tables.statusPageMonitorLinks.status_page_id, page.id))
        .orderBy(DB.Tables.statusPageMonitorLinks.sort_order);

    const monitorIds = links.map(({ monitor }) => monitor.id);

    const latestChecksByMonitor = new Map<number, DB.Models.MonitorStatusCheck>();
    if (monitorIds.length > 0) {
        // Fetch the latest check per monitor using a subquery is awkward in Drizzle D1,
        // so we fetch recent checks and pick the first per monitor.
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

    const monitorSummary = (monitor: DB.Models.Monitor, link: DB.Models.StatusPageMonitorLink): StatusPagesReadModel.MonitorSummary => {
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

    const groupSummaries = groups.map((group: DB.Models.StatusPageGroup) => ({
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

export async function isMonitorPublic(monitorId: number): Promise<boolean> {
    const link = await DB.instance()
        .select()
        .from(DB.Tables.statusPageMonitorLinks)
        .innerJoin(
            DB.Tables.statusPages,
            eq(DB.Tables.statusPageMonitorLinks.status_page_id, DB.Tables.statusPages.id)
        )
        .where(and(
            eq(DB.Tables.statusPageMonitorLinks.monitor_id, monitorId),
            eq(DB.Tables.statusPages.is_public, true),
            eq(DB.Tables.statusPages.is_enabled, true)
        ))
        .limit(1)
        .get();

    return !!link;
}
