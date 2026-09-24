import { eq, and, inArray, desc } from "drizzle-orm";
import { DB } from "../../../../../../db";
import { StatusPageAdminModel, StatusPagesReadModel } from "./model";
import { MonitorStats } from "../../../../../../utils/monitor-stats";

const CONFIG_ID = 1;

/**
 * Fetches all update entries for the given parent type and ids in one query
 * and groups them by parent id, newest first. Used to embed update timelines
 * in status page responses and content lists.
 */
export async function fetchParentedUpdates(
    parentType: 'incident' | 'maintenance',
    parentIds: number[]
): Promise<Map<number, DB.Models.StatusUpdate[]>> {
    const grouped = new Map<number, DB.Models.StatusUpdate[]>();

    if (parentIds.length === 0) {
        return grouped;
    }

    const updates = await DB.instance()
        .select()
        .from(DB.Tables.statusUpdates)
        .where(
            and(
                eq(DB.Tables.statusUpdates.parent_type, parentType),
                inArray(DB.Tables.statusUpdates.parent_id, parentIds)
            )
        )
        .orderBy(desc(DB.Tables.statusUpdates.created_at));

    for (const update of updates) {
        if (!grouped.has(update.parent_id)) {
            grouped.set(update.parent_id, []);
        }
        grouped.get(update.parent_id)!.push(update);
    }

    return grouped;
}

export async function getOrCreateConfig(): Promise<DB.Models.StatusPageConfig> {
    const existing = await DB.instance()
        .select()
        .from(DB.Tables.statusPageConfig)
        .where(eq(DB.Tables.statusPageConfig.id, CONFIG_ID))
        .get();

    if (existing) {
        return existing;
    }

    const now = Date.now();
    return DB.instance()
        .insert(DB.Tables.statusPageConfig)
        .values({
            id: CONFIG_ID,
            title: "Status Page",
            description: null,
            is_public: true,
            is_enabled: true,
            theme: "auto",
            created_at: now,
            updated_at: now,
        })
        .returning()
        .get();
}

export async function updateConfig(body: StatusPageAdminModel.Config.Body): Promise<DB.Models.StatusPageConfig> {
    const updates: Record<string, unknown> = { ...body, updated_at: Date.now() };

    await DB.instance()
        .update(DB.Tables.statusPageConfig)
        .set(updates)
        .where(eq(DB.Tables.statusPageConfig.id, CONFIG_ID))
        .run();

    return getOrCreateConfig();
}

export async function buildFullPage(): Promise<StatusPageAdminModel.FullPage.Response> {
    const config = await getOrCreateConfig();

    const groups = await DB.instance()
        .select()
        .from(DB.Tables.monitorGroups)
        .orderBy(DB.Tables.monitorGroups.sort_order);

    const rawLinks = await DB.instance()
        .select({
            link: DB.Tables.monitorGroupAssignments,
            monitor_name: DB.Tables.monitors.name,
        })
        .from(DB.Tables.monitorGroupAssignments)
        .innerJoin(DB.Tables.monitors, eq(DB.Tables.monitorGroupAssignments.monitor_id, DB.Tables.monitors.id))
        .orderBy(DB.Tables.monitorGroupAssignments.sort_order);

    const links = rawLinks.map(({ link, monitor_name }) => ({
        ...link,
        monitor_name,
    }));

    return { config, groups, links };
}

export async function createGroup(body: StatusPageAdminModel.CreateGroup.Body): Promise<DB.Models.MonitorGroup> {
    return DB.instance().insert(DB.Tables.monitorGroups).values({
        name: body.name,
        sort_order: body.sort_order,
    }).returning().get();
}

export async function updateGroup(groupId: number, body: StatusPageAdminModel.UpdateGroup.Body): Promise<DB.Models.MonitorGroup> {
    await DB.instance().update(DB.Tables.monitorGroups).set(body).where(
        eq(DB.Tables.monitorGroups.id, groupId)
    ).run();

    const refreshed = await DB.instance().select().from(DB.Tables.monitorGroups).where(
        eq(DB.Tables.monitorGroups.id, groupId)
    ).get();

    if (!refreshed) {
        throw new Error("Group not found after update");
    }

    return refreshed;
}

export async function deleteGroup(groupId: number): Promise<void> {
    await DB.instance().update(DB.Tables.monitorGroupAssignments).set({
        group_id: null
    }).where(
        eq(DB.Tables.monitorGroupAssignments.group_id, groupId)
    ).run();

    await DB.instance().delete(DB.Tables.monitorGroups).where(
        eq(DB.Tables.monitorGroups.id, groupId)
    ).run();
}

export async function createLink(body: StatusPageAdminModel.CreateLink.Body): Promise<DB.Models.MonitorGroupAssignment> {
    return DB.instance().insert(DB.Tables.monitorGroupAssignments).values({
        monitor_id: body.monitor_id,
        group_id: body.group_id ?? null,
        display_name: body.display_name ?? null,
        sort_order: body.sort_order,
    }).returning().get();
}

export async function updateLink(linkId: number, body: StatusPageAdminModel.UpdateLink.Body): Promise<DB.Models.MonitorGroupAssignment> {
    await DB.instance().update(DB.Tables.monitorGroupAssignments).set(body).where(
        eq(DB.Tables.monitorGroupAssignments.id, linkId)
    ).run();

    const refreshed = await DB.instance().select().from(DB.Tables.monitorGroupAssignments).where(
        eq(DB.Tables.monitorGroupAssignments.id, linkId)
    ).get();

    if (!refreshed) {
        throw new Error("Monitor link not found after update");
    }

    return refreshed;
}

export async function deleteLink(linkId: number): Promise<void> {
    await DB.instance().delete(DB.Tables.monitorGroupAssignments).where(
        eq(DB.Tables.monitorGroupAssignments.id, linkId)
    ).run();
}

export async function reorderGroups(body: StatusPageAdminModel.ReorderGroups.Body): Promise<DB.Models.MonitorGroup[]> {
    for (const group of body.groups) {
        await DB.instance().update(DB.Tables.monitorGroups).set({
            sort_order: group.sort_order,
        }).where(
            eq(DB.Tables.monitorGroups.id, group.id)
        ).run();
    }

    return DB.instance()
        .select()
        .from(DB.Tables.monitorGroups)
        .orderBy(DB.Tables.monitorGroups.sort_order);
}

export async function reorderLinks(body: StatusPageAdminModel.ReorderLinks.Body): Promise<StatusPageAdminModel.FullPage.Response['links']> {
    for (const link of body.links) {
        await DB.instance().update(DB.Tables.monitorGroupAssignments).set({
            group_id: link.group_id,
            sort_order: link.sort_order,
        }).where(
            eq(DB.Tables.monitorGroupAssignments.id, link.id)
        ).run();
    }

    const rawLinks = await DB.instance()
        .select({
            link: DB.Tables.monitorGroupAssignments,
            monitor_name: DB.Tables.monitors.name,
        })
        .from(DB.Tables.monitorGroupAssignments)
        .innerJoin(DB.Tables.monitors, eq(DB.Tables.monitorGroupAssignments.monitor_id, DB.Tables.monitors.id))
        .orderBy(DB.Tables.monitorGroupAssignments.sort_order);

    return rawLinks.map(({ link, monitor_name }) => ({
        ...link,
        monitor_name,
    }));
}

type LinkedMonitor = {
    id: number;
    name: string;
    display_name: string | null;
    group_id: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** The `days` UTC calendar days ending today, oldest first. */
function historyDayRange(days: number): string[] {
    const todayStart = new Date(Date.now()).setUTCHours(0, 0, 0, 0);
    return Array.from({ length: days }, (_, i) => MonitorStats.dayKey(todayStart - (days - 1 - i) * DAY_MS));
}

/**
 * Daily uptime history for the given monitors, read from the per-day
 * aggregates (one row per monitor and day).
 */
export async function buildMonitorHistory(
    days: number,
    linkedMonitors: LinkedMonitor[]
): Promise<StatusPagesReadModel.GetHistory.Response> {
    const dayKeys = historyDayRange(days);
    const startDate = dayKeys[0]!;
    const endDate = dayKeys[dayKeys.length - 1]!;

    const stats = await MonitorStats.getDailyStats(linkedMonitors.map((m) => m.id), startDate, endDate);
    const statsByMonitorDay = new Map(stats.map((row) => [`${row.monitor_id}|${row.day}`, row]));

    const monitors: StatusPagesReadModel.MonitorHistory[] = linkedMonitors.map((monitor) => {
        let totalUp = 0;
        let totalKnown = 0;

        const buckets: StatusPagesReadModel.HistoryBucket[] = dayKeys.map((date) => {
            const day = statsByMonitorDay.get(`${monitor.id}|${date}`);
            const up = day?.up_count ?? 0;
            const known = day ? MonitorStats.knownChecks(day) : 0;
            totalUp += up;
            totalKnown += known;

            return {
                date,
                status: MonitorStats.worstStatus(day),
                uptime_percentage: MonitorStats.uptimePercentage(up, known),
                total_checks: day ? MonitorStats.totalChecks(day) : 0,
            };
        });

        return {
            monitor_id: monitor.id,
            name: monitor.name,
            display_name: monitor.display_name,
            group_id: monitor.group_id,
            uptime_percentage: MonitorStats.uptimePercentage(totalUp, totalKnown),
            buckets,
        };
    });

    return {
        days,
        start_date: startDate,
        end_date: endDate,
        monitors,
    };
}

/**
 * Detailed daily history for a single monitor, including response-time
 * aggregation (per-day averages plus overall min/avg/max/p95) and the most
 * recent checks. Used by the public monitor detail page.
 *
 * The p95 is estimated from the per-day latency histograms (see
 * MonitorStats.latencySummary).
 */
export async function buildSingleMonitorHistory(
    days: number,
    monitor: { id: number }
): Promise<StatusPagesReadModel.GetPublicMonitorHistory.Response> {
    const dayKeys = historyDayRange(days);
    const startDate = dayKeys[0]!;
    const endDate = dayKeys[dayKeys.length - 1]!;

    const [stats, recentChecks] = await Promise.all([
        MonitorStats.getDailyStats([monitor.id], startDate, endDate),
        MonitorStats.getRecentChecks(monitor.id, 30),
    ]);
    const statsByDay = new Map(stats.map((row) => [row.day, row]));

    let totalUp = 0;
    let totalKnown = 0;
    let totalChecks = 0;

    const buckets: StatusPagesReadModel.GetPublicMonitorHistory.LatencyBucket[] = dayKeys.map((date) => {
        const day = statsByDay.get(date);
        const up = day?.up_count ?? 0;
        const known = day ? MonitorStats.knownChecks(day) : 0;
        const checks = day ? MonitorStats.totalChecks(day) : 0;
        totalUp += up;
        totalKnown += known;
        totalChecks += checks;

        return {
            date,
            status: MonitorStats.worstStatus(day),
            uptime_percentage: MonitorStats.uptimePercentage(up, known),
            total_checks: checks,
            avg_response_time_ms: day && day.response_time_count > 0
                ? Math.round(day.response_time_sum / day.response_time_count)
                : null,
        };
    });

    const latency = MonitorStats.latencySummary(stats, 0.95);

    return {
        days,
        start_date: startDate,
        end_date: endDate,
        uptime_percentage: MonitorStats.uptimePercentage(totalUp, totalKnown),
        total_checks: totalChecks,
        latency: {
            avg_response_time_ms: latency.avg,
            min_response_time_ms: latency.min,
            max_response_time_ms: latency.max,
            p95_response_time_ms: latency.percentile,
        },
        buckets,
        recent_checks: recentChecks,
    };
}
