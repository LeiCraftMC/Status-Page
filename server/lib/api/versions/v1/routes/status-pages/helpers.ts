import { eq } from "drizzle-orm";
import { DB } from "../../../../../../../db";
import { StatusPageAdminModel } from "../admin/status-pages/model";

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
