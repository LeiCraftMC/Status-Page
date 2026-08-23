import { eq, and, gte, lte, inArray } from "drizzle-orm";
import { DB } from "../../../../../../db";
import { StatusPageAdminModel, StatusPagesReadModel } from "./model";

const CONFIG_ID = 1;

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

function formatISODate(timestamp: number): string {
    return new Date(timestamp).toISOString().slice(0, 10);
}

function startOfDayUTC(timestamp: number): number {
    const d = new Date(timestamp);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
}

function endOfDayUTC(timestamp: number): number {
    const d = new Date(timestamp);
    d.setUTCHours(23, 59, 59, 999);
    return d.getTime();
}

export async function buildMonitorHistory(
    days: number,
    linkedMonitors: LinkedMonitor[]
): Promise<StatusPagesReadModel.GetHistory.Response> {
    const now = Date.now();
    const endDate = endOfDayUTC(now);
    const startDate = startOfDayUTC(now - (days - 1) * 24 * 60 * 60 * 1000);

    // Precompute empty buckets for every day in the range
    const bucketsByDate = new Map<string, { start: number; end: number }>();
    for (let d = 0; d < days; d++) {
        const dayStart = startDate + d * 24 * 60 * 60 * 1000;
        const dateKey = formatISODate(dayStart);
        bucketsByDate.set(dateKey, { start: dayStart, end: endOfDayUTC(dayStart) });
    }

    const monitorIds = linkedMonitors.map((m) => m.id);

    // Fetch all relevant checks in one query (bounded by days, not all time)
    const checks = monitorIds.length > 0
        ? await DB.instance()
            .select()
            .from(DB.Tables.monitorStatusChecks)
            .where(
                and(
                    inArray(DB.Tables.monitorStatusChecks.monitor_id, monitorIds),
                    gte(DB.Tables.monitorStatusChecks.checked_at, startDate),
                    lte(DB.Tables.monitorStatusChecks.checked_at, endDate)
                )
            )
        : [];

    const checksByMonitor = new Map<number, typeof checks>();
    for (const check of checks) {
        if (!checksByMonitor.has(check.monitor_id)) {
            checksByMonitor.set(check.monitor_id, []);
        }
        checksByMonitor.get(check.monitor_id)!.push(check);
    }

    const statusRank: Record<StatusPagesReadModel.HistoryStatus, number> = {
        up: 0,
        unknown: 1,
        degraded: 2,
        down: 3,
    };

    function getBucketDate(timestamp: number): string {
        return formatISODate(timestamp);
    }

    function getWorstStatus(bucketChecks: typeof checks): StatusPagesReadModel.HistoryStatus {
        if (bucketChecks.length === 0) return 'unknown';
        let worst: StatusPagesReadModel.HistoryStatus = 'up';
        for (const check of bucketChecks) {
            const status = check.status;
            if (statusRank[status] > statusRank[worst]) {
                worst = status;
            }
        }
        return worst;
    }

    const monitors: StatusPagesReadModel.MonitorHistory[] = linkedMonitors.map((monitor) => {
        const monitorChecks = checksByMonitor.get(monitor.id) ?? [];
        const checksByDate = new Map<string, typeof checks>();

        for (const check of monitorChecks) {
            const dateKey = getBucketDate(check.checked_at ?? 0);
            if (!bucketsByDate.has(dateKey)) continue;
            if (!checksByDate.has(dateKey)) {
                checksByDate.set(dateKey, []);
            }
            checksByDate.get(dateKey)!.push(check);
        }

        let totalUp = 0;
        let totalKnown = 0;

        const buckets: StatusPagesReadModel.HistoryBucket[] = [];
        for (const [dateKey] of bucketsByDate) {
            const dayChecks = checksByDate.get(dateKey) ?? [];
            const worstStatus = getWorstStatus(dayChecks);

            const upCount = dayChecks.filter((c) => c.status === 'up').length;
            const knownCount = dayChecks.filter((c) => c.status !== 'unknown').length;

            totalUp += upCount;
            totalKnown += knownCount;

            const uptimePercentage = knownCount > 0
                ? Math.round((upCount / knownCount) * 1000) / 10
                : 0;

            buckets.push({
                date: dateKey,
                status: worstStatus,
                uptime_percentage: uptimePercentage,
                total_checks: dayChecks.length,
            });
        }

        // Sort buckets by date ascending (oldest first) for bar display
        buckets.sort((a, b) => a.date.localeCompare(b.date));

        const uptimePercentage = totalKnown > 0
            ? Math.round((totalUp / totalKnown) * 1000) / 10
            : 0;

        return {
            monitor_id: monitor.id,
            name: monitor.name,
            display_name: monitor.display_name,
            group_id: monitor.group_id,
            uptime_percentage: uptimePercentage,
            buckets,
        };
    });

    return {
        days,
        start_date: formatISODate(startDate),
        end_date: formatISODate(endDate),
        monitors,
    };
}
