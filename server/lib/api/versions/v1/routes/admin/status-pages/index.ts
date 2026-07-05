import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { and, eq, isNull } from "drizzle-orm";
import { DB } from "../../../../../../../db";
import { APIResponse } from "../../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../../utils/specHelpers";
import { StatusPagesModel } from "./model";
import { DOCS_TAGS } from "../../../docs";

const TARGET_PAGE_KEY = "targetStatusPage";
const TARGET_GROUP_KEY = "targetGroup";
const TARGET_LINK_KEY = "targetLink";

export const router = new Hono().basePath('/status-pages');

router.get('/',

    APIRouteSpec.authenticated({
        summary: "List status pages",
        description: "Retrieve all status pages, including disabled or private ones.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Status pages retrieved successfully", StatusPagesModel.GetAll.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),

    async (c) => {
        const pages = await DB.instance()
            .select()
            .from(DB.Tables.statusPages)
            .orderBy(DB.Tables.statusPages.id);

        return APIResponse.success(c, "Status pages retrieved successfully", pages);
    }
);

router.post('/',

    APIRouteSpec.authenticated({
        summary: "Create status page",
        description: "Create a new public or internal status page.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Status page created successfully", StatusPagesModel.Create.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.conflict("A status page with this slug already exists")
        )
    }),

    zValidator("json", StatusPagesModel.Create.Body),

    async (c) => {
        const body = c.req.valid("json") as StatusPagesModel.Create.Body;

        const duplicate = await DB.instance().select().from(DB.Tables.statusPages).where(
            eq(DB.Tables.statusPages.slug, body.slug)
        ).get();

        if (duplicate) {
            return APIResponse.conflict(c, "A status page with this slug already exists");
        }

        const created = await DB.instance().insert(DB.Tables.statusPages).values(body).returning().get();

        return APIResponse.created(c, "Status page created successfully", created);
    }
);

// @ts-ignore
router.use('/:pageId/*',

    zValidator("param", StatusPagesModel.PageId.Params),

    async (c, next) => {
        // @ts-ignore
        const { pageId } = c.req.valid("param") as StatusPagesModel.PageId.Params;

        const page = await DB.instance().select().from(DB.Tables.statusPages).where(
            eq(DB.Tables.statusPages.id, pageId)
        ).get();

        if (!page) {
            return APIResponse.notFound(c, "Status page not found");
        }

        // @ts-ignore
        c.set(TARGET_PAGE_KEY, page);

        await next();
    }
);

router.get('/:pageId',

    APIRouteSpec.authenticated({
        summary: "Get status page details",
        description: "Retrieve a status page with its groups and linked monitors.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Status page retrieved successfully", StatusPagesModel.FullPage.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const page = c.get(TARGET_PAGE_KEY) as StatusPagesModel.BasePage;

        const full = await buildFullPage(page);
        return APIResponse.success(c, "Status page retrieved successfully", full);
    }
);

router.put('/:pageId',

    APIRouteSpec.authenticated({
        summary: "Update status page",
        description: "Update a status page's metadata, visibility, or theme.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Status page updated successfully", StatusPagesModel.Update.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Status page not found"),
            APIResponseSpec.conflict("A status page with this slug already exists")
        )
    }),

    zValidator("json", StatusPagesModel.Update.Body),

    async (c) => {
        // @ts-ignore
        const page = c.get(TARGET_PAGE_KEY) as StatusPagesModel.BasePage;
        const body = c.req.valid("json") as StatusPagesModel.Update.Body;

        const updates = Object.fromEntries(
            Object.entries(body).filter(([, value]) => value !== undefined)
        ) as Partial<StatusPagesModel.Update.Body>;

        if (Object.keys(updates).length === 0) {
            return APIResponse.badRequest(c, "Provide at least one field to update");
        }

        if (updates.slug && updates.slug !== page.slug) {
            const duplicate = await DB.instance().select().from(DB.Tables.statusPages).where(
                eq(DB.Tables.statusPages.slug, updates.slug)
            ).get();
            if (duplicate) {
                return APIResponse.conflict(c, "A status page with this slug already exists");
            }
        }

        await DB.instance().update(DB.Tables.statusPages).set(updates).where(
            eq(DB.Tables.statusPages.id, page.id)
        ).run();

        const refreshed = await DB.instance().select().from(DB.Tables.statusPages).where(
            eq(DB.Tables.statusPages.id, page.id)
        ).get();

        if (!refreshed) {
            throw new Error("Status page not found after update");
        }

        return APIResponse.success(c, "Status page updated successfully", refreshed);
    }
);

router.delete('/:pageId',

    APIRouteSpec.authenticated({
        summary: "Delete status page",
        description: "Permanently remove a status page and its groups/links.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Status page deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    async (c) => {
        // @ts-ignore
        const page = c.get(TARGET_PAGE_KEY) as StatusPagesModel.BasePage;

        await DB.instance().delete(DB.Tables.statusPageGroups).where(
            eq(DB.Tables.statusPageGroups.status_page_id, page.id)
        ).run();

        await DB.instance().delete(DB.Tables.statusPageMonitorLinks).where(
            eq(DB.Tables.statusPageMonitorLinks.status_page_id, page.id)
        ).run();

        await DB.instance().delete(DB.Tables.statusPages).where(
            eq(DB.Tables.statusPages.id, page.id)
        ).run();

        return APIResponse.successNoData(c, "Status page deleted successfully");
    }
);

router.post('/:pageId/groups',

    APIRouteSpec.authenticated({
        summary: "Add status page group",
        description: "Add a new group to a status page.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Group created successfully", StatusPagesModel.CreateGroup.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Status page not found")
        )
    }),

    zValidator("json", StatusPagesModel.CreateGroup.Body),

    async (c) => {
        // @ts-ignore
        const page = c.get(TARGET_PAGE_KEY) as StatusPagesModel.BasePage;
        const body = c.req.valid("json") as StatusPagesModel.CreateGroup.Body;

        const created = await DB.instance().insert(DB.Tables.statusPageGroups).values({
            status_page_id: page.id,
            name: body.name,
            sort_order: body.sort_order,
        }).returning().get();

        return APIResponse.created(c, "Group created successfully", created);
    }
);

// @ts-ignore
router.use('/:pageId/groups/:groupId/*',

    zValidator("param", StatusPagesModel.GroupId.Params),

    async (c, next) => {
        // @ts-ignore
        const { pageId, groupId } = c.req.valid("param") as StatusPagesModel.GroupId.Params;

        const group = await DB.instance().select().from(DB.Tables.statusPageGroups).where(
            and(
                eq(DB.Tables.statusPageGroups.id, groupId),
                eq(DB.Tables.statusPageGroups.status_page_id, pageId)
            )
        ).get();

        if (!group) {
            return APIResponse.notFound(c, "Group not found");
        }

        // @ts-ignore
        c.set(TARGET_GROUP_KEY, group);

        await next();
    }
);

router.put('/:pageId/groups/:groupId',

    APIRouteSpec.authenticated({
        summary: "Update status page group",
        description: "Rename or reorder a status page group.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Group updated successfully", StatusPagesModel.UpdateGroup.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Group not found")
        )
    }),

    zValidator("json", StatusPagesModel.UpdateGroup.Body),

    async (c) => {
        // @ts-ignore
        const group = c.get(TARGET_GROUP_KEY) as StatusPagesModel.BaseGroup;
        const body = c.req.valid("json") as StatusPagesModel.UpdateGroup.Body;

        await DB.instance().update(DB.Tables.statusPageGroups).set(body).where(
            eq(DB.Tables.statusPageGroups.id, group.id)
        ).run();

        const refreshed = await DB.instance().select().from(DB.Tables.statusPageGroups).where(
            eq(DB.Tables.statusPageGroups.id, group.id)
        ).get();

        if (!refreshed) {
            throw new Error("Group not found after update");
        }

        return APIResponse.success(c, "Group updated successfully", refreshed);
    }
);

router.delete('/:pageId/groups/:groupId',

    APIRouteSpec.authenticated({
        summary: "Delete status page group",
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
        const group = c.get(TARGET_GROUP_KEY) as StatusPagesModel.BaseGroup;

        await DB.instance().update(DB.Tables.statusPageMonitorLinks).set({
            group_id: null
        }).where(
            eq(DB.Tables.statusPageMonitorLinks.group_id, group.id)
        ).run();

        await DB.instance().delete(DB.Tables.statusPageGroups).where(
            eq(DB.Tables.statusPageGroups.id, group.id)
        ).run();

        return APIResponse.successNoData(c, "Group deleted successfully");
    }
);

router.post('/:pageId/monitors',

    APIRouteSpec.authenticated({
        summary: "Link monitor to status page",
        description: "Attach an existing monitor to a status page, optionally within a group.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Monitor linked successfully", StatusPagesModel.CreateLink.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Status page or monitor not found"),
            APIResponseSpec.conflict("Monitor is already linked to this page")
        )
    }),

    zValidator("json", StatusPagesModel.CreateLink.Body),

    async (c) => {
        // @ts-ignore
        const page = c.get(TARGET_PAGE_KEY) as StatusPagesModel.BasePage;
        const body = c.req.valid("json") as StatusPagesModel.CreateLink.Body;

        const monitor = await DB.instance().select().from(DB.Tables.monitors).where(
            eq(DB.Tables.monitors.id, body.monitor_id)
        ).get();

        if (!monitor) {
            return APIResponse.notFound(c, "Monitor not found");
        }

        if (body.group_id) {
            const group = await DB.instance().select().from(DB.Tables.statusPageGroups).where(
                and(
                    eq(DB.Tables.statusPageGroups.id, body.group_id),
                    eq(DB.Tables.statusPageGroups.status_page_id, page.id)
                )
            ).get();
            if (!group) {
                return APIResponse.notFound(c, "Group not found on this status page");
            }
        }

        const existing = await DB.instance().select().from(DB.Tables.statusPageMonitorLinks).where(
            and(
                eq(DB.Tables.statusPageMonitorLinks.status_page_id, page.id),
                eq(DB.Tables.statusPageMonitorLinks.monitor_id, body.monitor_id)
            )
        ).get();

        if (existing) {
            return APIResponse.conflict(c, "Monitor is already linked to this page");
        }

        const link = await DB.instance().insert(DB.Tables.statusPageMonitorLinks).values({
            status_page_id: page.id,
            monitor_id: body.monitor_id,
            group_id: body.group_id ?? null,
            display_name: body.display_name ?? null,
            sort_order: body.sort_order,
        }).returning().get();

        return APIResponse.created(c, "Monitor linked successfully", { link });
    }
);

// @ts-ignore
router.use('/:pageId/monitors/:linkId/*',

    zValidator("param", StatusPagesModel.LinkId.Params),

    async (c, next) => {
        // @ts-ignore
        const { pageId, linkId } = c.req.valid("param") as StatusPagesModel.LinkId.Params;

        const link = await DB.instance().select().from(DB.Tables.statusPageMonitorLinks).where(
            and(
                eq(DB.Tables.statusPageMonitorLinks.id, linkId),
                eq(DB.Tables.statusPageMonitorLinks.status_page_id, pageId)
            )
        ).get();

        if (!link) {
            return APIResponse.notFound(c, "Monitor link not found");
        }

        // @ts-ignore
        c.set(TARGET_LINK_KEY, link);

        await next();
    }
);

router.put('/:pageId/monitors/:linkId',

    APIRouteSpec.authenticated({
        summary: "Update monitor link",
        description: "Change the display name, group, or order of a linked monitor.",
        tags: [DOCS_TAGS.ADMIN_STATUS_PAGES],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Monitor link updated successfully", StatusPagesModel.UpdateLink.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Monitor link not found")
        )
    }),

    zValidator("json", StatusPagesModel.UpdateLink.Body),

    async (c) => {
        // @ts-ignore
        const link = c.get(TARGET_LINK_KEY) as StatusPagesModel.BaseLink;
        const body = c.req.valid("json") as StatusPagesModel.UpdateLink.Body;

        if (body.group_id) {
            // @ts-ignore
            const page = c.get(TARGET_PAGE_KEY) as StatusPagesModel.BasePage;
            const group = await DB.instance().select().from(DB.Tables.statusPageGroups).where(
                and(
                    eq(DB.Tables.statusPageGroups.id, body.group_id),
                    eq(DB.Tables.statusPageGroups.status_page_id, page.id)
                )
            ).get();
            if (!group) {
                return APIResponse.notFound(c, "Group not found on this status page");
            }
        }

        await DB.instance().update(DB.Tables.statusPageMonitorLinks).set(body).where(
            eq(DB.Tables.statusPageMonitorLinks.id, link.id)
        ).run();

        const refreshed = await DB.instance().select().from(DB.Tables.statusPageMonitorLinks).where(
            eq(DB.Tables.statusPageMonitorLinks.id, link.id)
        ).get();

        if (!refreshed) {
            throw new Error("Monitor link not found after update");
        }

        return APIResponse.success(c, "Monitor link updated successfully", { link: refreshed });
    }
);

router.delete('/:pageId/monitors/:linkId',

    APIRouteSpec.authenticated({
        summary: "Unlink monitor from status page",
        description: "Remove a monitor from a status page.",
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
        const link = c.get(TARGET_LINK_KEY) as StatusPagesModel.BaseLink;

        await DB.instance().delete(DB.Tables.statusPageMonitorLinks).where(
            eq(DB.Tables.statusPageMonitorLinks.id, link.id)
        ).run();

        return APIResponse.successNoData(c, "Monitor unlinked successfully");
    }
);

export async function buildFullPage(page: StatusPagesModel.BasePage): Promise<StatusPagesModel.FullPage.Response> {
    const groups = await DB.instance()
        .select()
        .from(DB.Tables.statusPageGroups)
        .where(eq(DB.Tables.statusPageGroups.status_page_id, page.id))
        .orderBy(DB.Tables.statusPageGroups.sort_order);

    const rawLinks = await DB.instance()
        .select({
            link: DB.Tables.statusPageMonitorLinks,
            monitor_name: DB.Tables.monitors.name,
        })
        .from(DB.Tables.statusPageMonitorLinks)
        .innerJoin(DB.Tables.monitors, eq(DB.Tables.statusPageMonitorLinks.monitor_id, DB.Tables.monitors.id))
        .where(eq(DB.Tables.statusPageMonitorLinks.status_page_id, page.id))
        .orderBy(DB.Tables.statusPageMonitorLinks.sort_order);

    const links = rawLinks.map(({ link, monitor_name }) => ({
        ...link,
        monitor_name,
    }));

    return { page, groups, links };
}
