import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import z from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { DB } from "../../../../../../../db";
import { APIResponse } from "../../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { StatusPageAdminModel } from "./model";
import { router as contentRouter } from "./content";
import { DOCS_TAGS } from "../../../docs";

const CONFIG_ID = 1;
const TARGET_GROUP_KEY = "targetGroup";
const TARGET_LINK_KEY = "targetLink";

export const router = new Hono().basePath('/status-page');

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

router.get('/',

    APIRouteSpec.authenticated({
        summary: "Get status page configuration",
        description: "Retrieve the single status page configuration with groups and linked monitors.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Status page retrieved successfully", StatusPageAdminModel.FullPage.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    async (c) => {
        const full = await buildFullPage();
        return APIResponse.success(c, "Status page retrieved successfully", full);
    }
);

router.put('/',

    APIRouteSpec.authenticated({
        summary: "Update status page configuration",
        description: "Update the single status page's metadata, visibility, or theme.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Status page updated successfully", StatusPageAdminModel.Config.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    zValidator("json", StatusPageAdminModel.Config.Body),

    async (c) => {
        const body = c.req.valid("json") as StatusPageAdminModel.Config.Body;

        const updates: Record<string, unknown> = { ...body, updated_at: Date.now() };

        await DB.instance()
            .update(DB.Tables.statusPageConfig)
            .set(updates)
            .where(eq(DB.Tables.statusPageConfig.id, CONFIG_ID))
            .run();

        const refreshed = await getOrCreateConfig();
        return APIResponse.success(c, "Status page updated successfully", refreshed);
    }
);

router.get('/groups',

    APIRouteSpec.authenticated({
        summary: "List monitor groups",
        description: "Retrieve all monitor groups for the status page.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Groups retrieved successfully", z.array(StatusPageAdminModel.BaseGroup)),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    async (c) => {
        const groups = await DB.instance()
            .select()
            .from(DB.Tables.monitorGroups)
            .orderBy(DB.Tables.monitorGroups.sort_order);

        return APIResponse.success(c, "Groups retrieved successfully", groups);
    }
);

router.post('/groups',

    APIRouteSpec.authenticated({
        summary: "Add monitor group",
        description: "Add a new monitor group to the status page.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Group created successfully", StatusPageAdminModel.CreateGroup.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    zValidator("json", StatusPageAdminModel.CreateGroup.Body),

    async (c) => {
        const body = c.req.valid("json") as StatusPageAdminModel.CreateGroup.Body;

        const created = await DB.instance().insert(DB.Tables.monitorGroups).values({
            name: body.name,
            sort_order: body.sort_order,
        }).returning().get();

        return APIResponse.created(c, "Group created successfully", created);
    }
);

// @ts-ignore
router.use('/groups/:groupId/*',

    zValidator("param", StatusPageAdminModel.GroupId.Params),

    async (c, next) => {
        // @ts-ignore
        const { groupId } = c.req.valid("param") as StatusPageAdminModel.GroupId.Params;

        const group = await DB.instance().select().from(DB.Tables.monitorGroups).where(
            eq(DB.Tables.monitorGroups.id, groupId)
        ).get();

        if (!group) {
            return APIResponse.notFound(c, "Group not found");
        }

        // @ts-ignore
        c.set(TARGET_GROUP_KEY, group);

        await next();
    }
);

router.put('/groups/:groupId',

    APIRouteSpec.authenticated({
        summary: "Update monitor group",
        description: "Rename or reorder a monitor group.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Group updated successfully", StatusPageAdminModel.UpdateGroup.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Group not found")
        )
    }),

    zValidator("json", StatusPageAdminModel.UpdateGroup.Body),

    async (c) => {
        // @ts-ignore
        const group = c.get(TARGET_GROUP_KEY) as StatusPageAdminModel.BaseGroup;
        const body = c.req.valid("json") as StatusPageAdminModel.UpdateGroup.Body;

        await DB.instance().update(DB.Tables.monitorGroups).set(body).where(
            eq(DB.Tables.monitorGroups.id, group.id)
        ).run();

        const refreshed = await DB.instance().select().from(DB.Tables.monitorGroups).where(
            eq(DB.Tables.monitorGroups.id, group.id)
        ).get();

        if (!refreshed) {
            throw new Error("Group not found after update");
        }

        return APIResponse.success(c, "Group updated successfully", refreshed);
    }
);

router.delete('/groups/:groupId',

    APIRouteSpec.authenticated({
        summary: "Delete monitor group",
        description: "Remove a group. Linked monitors become ungrouped.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Group deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Group not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const group = c.get(TARGET_GROUP_KEY) as StatusPageAdminModel.BaseGroup;

        await DB.instance().update(DB.Tables.monitorGroupAssignments).set({
            group_id: null
        }).where(
            eq(DB.Tables.monitorGroupAssignments.group_id, group.id)
        ).run();

        await DB.instance().delete(DB.Tables.monitorGroups).where(
            eq(DB.Tables.monitorGroups.id, group.id)
        ).run();

        return APIResponse.successNoData(c, "Group deleted successfully");
    }
);

router.get('/monitors',

    APIRouteSpec.authenticated({
        summary: "List linked monitors",
        description: "Retrieve all monitors linked to the status page.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Links retrieved successfully", z.array(StatusPageAdminModel.BaseLink.extend({
                monitor_name: z.string(),
            }))),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    async (c) => {
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

        return APIResponse.success(c, "Links retrieved successfully", links);
    }
);

router.post('/monitors',

    APIRouteSpec.authenticated({
        summary: "Link monitor to status page",
        description: "Attach an existing monitor to the status page, optionally within a group.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Monitor linked successfully", StatusPageAdminModel.CreateLink.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Status page or monitor not found"),
            APIResponseSpec.conflict("Monitor is already linked to the status page")
        )
    }),

    zValidator("json", StatusPageAdminModel.CreateLink.Body),

    async (c) => {
        const body = c.req.valid("json") as StatusPageAdminModel.CreateLink.Body;

        const monitor = await DB.instance().select().from(DB.Tables.monitors).where(
            eq(DB.Tables.monitors.id, body.monitor_id)
        ).get();

        if (!monitor) {
            return APIResponse.notFound(c, "Monitor not found");
        }

        if (body.group_id) {
            const group = await DB.instance().select().from(DB.Tables.monitorGroups).where(
                eq(DB.Tables.monitorGroups.id, body.group_id)
            ).get();
            if (!group) {
                return APIResponse.notFound(c, "Group not found");
            }
        }

        const existing = await DB.instance().select().from(DB.Tables.monitorGroupAssignments).where(
            eq(DB.Tables.monitorGroupAssignments.monitor_id, body.monitor_id)
        ).get();

        if (existing) {
            return APIResponse.conflict(c, "Monitor is already linked to the status page");
        }

        const link = await DB.instance().insert(DB.Tables.monitorGroupAssignments).values({
            monitor_id: body.monitor_id,
            group_id: body.group_id ?? null,
            display_name: body.display_name ?? null,
            sort_order: body.sort_order,
        }).returning().get();

        return APIResponse.created(c, "Monitor linked successfully", { link });
    }
);

// @ts-ignore
router.use('/monitors/:linkId/*',

    zValidator("param", StatusPageAdminModel.LinkId.Params),

    async (c, next) => {
        // @ts-ignore
        const { linkId } = c.req.valid("param") as StatusPageAdminModel.LinkId.Params;

        const link = await DB.instance().select().from(DB.Tables.monitorGroupAssignments).where(
            eq(DB.Tables.monitorGroupAssignments.id, linkId)
        ).get();

        if (!link) {
            return APIResponse.notFound(c, "Monitor link not found");
        }

        // @ts-ignore
        c.set(TARGET_LINK_KEY, link);

        await next();
    }
);

router.put('/monitors/:linkId',

    APIRouteSpec.authenticated({
        summary: "Update monitor link",
        description: "Change the display name, group, or order of a linked monitor.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Monitor link updated successfully", StatusPageAdminModel.UpdateLink.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Monitor link not found")
        )
    }),

    zValidator("json", StatusPageAdminModel.UpdateLink.Body),

    async (c) => {
        // @ts-ignore
        const link = c.get(TARGET_LINK_KEY) as StatusPageAdminModel.BaseLink;
        const body = c.req.valid("json") as StatusPageAdminModel.UpdateLink.Body;

        if (body.group_id) {
            const group = await DB.instance().select().from(DB.Tables.monitorGroups).where(
                eq(DB.Tables.monitorGroups.id, body.group_id)
            ).get();
            if (!group) {
                return APIResponse.notFound(c, "Group not found");
            }
        }

        await DB.instance().update(DB.Tables.monitorGroupAssignments).set(body).where(
            eq(DB.Tables.monitorGroupAssignments.id, link.id)
        ).run();

        const refreshed = await DB.instance().select().from(DB.Tables.monitorGroupAssignments).where(
            eq(DB.Tables.monitorGroupAssignments.id, link.id)
        ).get();

        if (!refreshed) {
            throw new Error("Monitor link not found after update");
        }

        return APIResponse.success(c, "Monitor link updated successfully", { link: refreshed });
    }
);

router.delete('/monitors/:linkId',

    APIRouteSpec.authenticated({
        summary: "Unlink monitor from status page",
        description: "Remove a monitor from the status page.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Monitor unlinked successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Monitor link not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const link = c.get(TARGET_LINK_KEY) as StatusPageAdminModel.BaseLink;

        await DB.instance().delete(DB.Tables.monitorGroupAssignments).where(
            eq(DB.Tables.monitorGroupAssignments.id, link.id)
        ).run();

        return APIResponse.successNoData(c, "Monitor unlinked successfully");
    }
);

router.route('/', contentRouter);
