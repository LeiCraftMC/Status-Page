
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { desc, eq } from "drizzle-orm";
import { DB } from "../../../../../../db";
import { APIResponse } from "../../../../utils/api-res";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { AuthHandler } from "../../../../utils/authHandler";
import { StatusPagesReadModel, StatusPageAdminModel } from "./model";
import { buildPublicPageResponse } from "./public";
import z from "zod";
import { router as contentRouter } from "./content";
import { DOCS_TAGS } from "../../docs";
import {
    getOrCreateConfig,
    updateConfig,
    buildFullPage,
    createGroup,
    updateGroup,
    deleteGroup,
    createLink,
    updateLink,
    deleteLink,
    buildMonitorHistory
} from "./helpers";

type StatusPageVariables = {
    targetGroup: StatusPageAdminModel.BaseGroup;
    targetLink: StatusPageAdminModel.BaseLink;
};

const router = new Hono<{ Variables: StatusPageVariables }>().basePath('/status-page');

router.route('/', contentRouter);

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

// --- Read endpoints (members + admins) ---

router.get('/',

    APIRouteSpec.authenticated({
        summary: "Get status page",
        description: "Retrieve the single status page with its groups, linked monitors, and recent content. Members and admins can read this regardless of the public flag.",
        tags: [DOCS_TAGS.STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Status page retrieved successfully", StatusPagesReadModel.GetPage.Response),
            APIResponseSpec.unauthorized("Authentication required")
        )
    }),

    async (c) => {
        const page = await getOrCreateConfig();
        const response = await buildPublicPageResponse(page, { includePrivate: true });

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

        return APIResponse.success(c, "Status page retrieved successfully", {
            ...response,
            incidents,
            maintenance,
            updates,
        });
    }
);

router.get('/config',

    APIRouteSpec.authenticated({
        summary: "Get status page configuration",
        description: "Retrieve the single status page configuration with groups and linked monitors.",
        tags: [DOCS_TAGS.STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Status page retrieved successfully", StatusPageAdminModel.FullPage.Response),
            APIResponseSpec.unauthorized("Authentication required")
        )
    }),

    async (c) => {
        const full = await buildFullPage();
        return APIResponse.success(c, "Status page retrieved successfully", full);
    }
);

router.get('/history',

    APIRouteSpec.authenticated({
        summary: "Get monitor uptime history",
        description: "Daily uptime history for each linked monitor. Default window is 90 days. Members and admins can read this.",
        tags: [DOCS_TAGS.STATUS_PAGES],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("History retrieved successfully", StatusPagesReadModel.GetHistory.Response),
            APIResponseSpec.unauthorized("Authentication required")
        )
    }),

    zValidator("query", StatusPagesReadModel.GetHistory.Query),

    async (c) => {
        // @ts-ignore — zValidator query typing is lost in middleware chains
        const { days } = c.req.valid("query") as StatusPagesReadModel.GetHistory.Query;

        const links = await DB.instance()
            .select({
                link: DB.Tables.monitorGroupAssignments,
                monitor: DB.Tables.monitors,
            })
            .from(DB.Tables.monitorGroupAssignments)
            .innerJoin(DB.Tables.monitors, eq(DB.Tables.monitorGroupAssignments.monitor_id, DB.Tables.monitors.id))
            .orderBy(DB.Tables.monitorGroupAssignments.sort_order);

        const linkedMonitors = links.map(({ link, monitor }) => ({
            id: monitor.id,
            name: monitor.name,
            display_name: link.display_name,
            group_id: link.group_id ?? null,
        }));

        const history = await buildMonitorHistory(days, linkedMonitors);

        return APIResponse.success(c, "History retrieved successfully", history);
    }
);

// --- Admin write endpoints ---

function adminOnly(c: any, next: any) {
    if (!requireAdmin(c)) {
        return APIResponse.forbidden(c, "Admin access required");
    }
    return next();
}

router.put('/',
    adminOnly,
    zValidator("json", StatusPageAdminModel.Config.Body),
    APIRouteSpec.authenticated({
        summary: "Update status page configuration",
        description: "Update the single status page's metadata, visibility, or theme. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGES],
        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Status page updated successfully", StatusPageAdminModel.Config.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),
    async (c) => {
        const body = c.req.valid("json") as StatusPageAdminModel.Config.Body;
        const updated = await updateConfig(body);
        return APIResponse.success(c, "Status page updated successfully", updated);
    }
);

router.get('/groups',
    APIRouteSpec.authenticated({
        summary: "List monitor groups",
        description: "Retrieve all monitor groups for the status page.",
        tags: [DOCS_TAGS.STATUS_PAGES],
        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Groups retrieved successfully", z.array(StatusPageAdminModel.BaseGroup)),
            APIResponseSpec.unauthorized("Authentication required")
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
    adminOnly,
    zValidator("json", StatusPageAdminModel.CreateGroup.Body),
    APIRouteSpec.authenticated({
        summary: "Add monitor group",
        description: "Add a new monitor group to the status page. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGES],
        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Group created successfully", StatusPageAdminModel.CreateGroup.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required")
        )
    }),
    async (c) => {
        const body = c.req.valid("json") as StatusPageAdminModel.CreateGroup.Body;
        const created = await createGroup(body);
        return APIResponse.created(c, "Group created successfully", created);
    }
);

router.use('/groups/:groupId/*',
    zValidator("param", StatusPageAdminModel.GroupId.Params),
    async (c, next) => {
        // @ts-ignore — zValidator param target typing is lost in middleware chains
        const { groupId } = c.req.valid("param") as StatusPageAdminModel.GroupId.Params;
        const group = await DB.instance().select().from(DB.Tables.monitorGroups).where(
            eq(DB.Tables.monitorGroups.id, groupId)
        ).get();

        if (!group) {
            return APIResponse.notFound(c, "Group not found");
        }

        // @ts-ignore — Hono's context variables type is lost across the zValidator chain
        c.set("targetGroup", group);
        await next();
    }
);

router.put('/groups/:groupId',
    adminOnly,
    zValidator("json", StatusPageAdminModel.UpdateGroup.Body),
    APIRouteSpec.authenticated({
        summary: "Update monitor group",
        description: "Rename or reorder a monitor group. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGES],
        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Group updated successfully", StatusPageAdminModel.UpdateGroup.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Group not found")
        )
    }),
    async (c) => {
        const group = c.get("targetGroup") as StatusPageAdminModel.BaseGroup;
        const body = c.req.valid("json") as StatusPageAdminModel.UpdateGroup.Body;
        const updated = await updateGroup(group.id, body);
        return APIResponse.success(c, "Group updated successfully", updated);
    }
);

router.delete('/groups/:groupId',
    adminOnly,
    APIRouteSpec.authenticated({
        summary: "Delete monitor group",
        description: "Remove a group. Linked monitors become ungrouped. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGES],
        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Group deleted successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Group not found")
        )
    }),
    async (c) => {
        const group = c.get("targetGroup") as StatusPageAdminModel.BaseGroup;
        await deleteGroup(group.id);
        return APIResponse.successNoData(c, "Group deleted successfully");
    }
);

router.get('/monitors',
    APIRouteSpec.authenticated({
        summary: "List linked monitors",
        description: "Retrieve all monitors linked to the status page.",
        tags: [DOCS_TAGS.STATUS_PAGES],
        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Links retrieved successfully", z.array(StatusPageAdminModel.BaseLink.extend({
                monitor_name: z.string(),
            }))),
            APIResponseSpec.unauthorized("Authentication required")
        )
    }),
    async (c) => {
        const links = await buildFullPage().then(r => r.links);
        return APIResponse.success(c, "Links retrieved successfully", links);
    }
);

router.post('/monitors',
    adminOnly,
    zValidator("json", StatusPageAdminModel.CreateLink.Body),
    APIRouteSpec.authenticated({
        summary: "Link monitor to status page",
        description: "Attach an existing monitor to the status page. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGES],
        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.created("Monitor linked successfully", StatusPageAdminModel.CreateLink.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Status page or monitor not found"),
            APIResponseSpec.conflict("Monitor is already linked to the status page")
        )
    }),
    async (c) => {
        const body = c.req.valid("json") as StatusPageAdminModel.CreateLink.Body;
        const created = await createLink(body);
        return APIResponse.created(c, "Monitor linked successfully", { link: created });
    }
);

router.use('/monitors/:linkId/*',
    zValidator("param", StatusPageAdminModel.LinkId.Params),
    async (c, next) => {
        // @ts-ignore — zValidator param target typing is lost in middleware chains
        const { linkId } = c.req.valid("param") as StatusPageAdminModel.LinkId.Params;
        const link = await DB.instance().select().from(DB.Tables.monitorGroupAssignments).where(
            eq(DB.Tables.monitorGroupAssignments.id, linkId)
        ).get();

        if (!link) {
            return APIResponse.notFound(c, "Monitor link not found");
        }

        // @ts-ignore — Hono's context variables type is lost across the zValidator chain
        c.set("targetLink", link);
        await next();
    }
);

router.put('/monitors/:linkId',
    adminOnly,
    zValidator("json", StatusPageAdminModel.UpdateLink.Body),
    APIRouteSpec.authenticated({
        summary: "Update monitor link",
        description: "Change the display name, group, or order of a linked monitor. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGES],
        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Monitor link updated successfully", StatusPageAdminModel.UpdateLink.Response),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Monitor link not found")
        )
    }),
    async (c) => {
        const link = c.get("targetLink") as StatusPageAdminModel.BaseLink;
        const body = c.req.valid("json") as StatusPageAdminModel.UpdateLink.Body;
        const updated = await updateLink(link.id, body);
        return APIResponse.success(c, "Monitor link updated successfully", { link: updated });
    }
);

router.delete('/monitors/:linkId',
    adminOnly,
    APIRouteSpec.authenticated({
        summary: "Unlink monitor from status page",
        description: "Remove a monitor from the status page. Admin only.",
        tags: [DOCS_TAGS.STATUS_PAGES],
        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Monitor unlinked successfully"),
            APIResponseSpec.unauthorized("Authentication required"),
            APIResponseSpec.forbidden("Admin access required"),
            APIResponseSpec.notFound("Monitor link not found")
        )
    }),
    async (c) => {
        const link = c.get("targetLink") as StatusPageAdminModel.BaseLink;
        await deleteLink(link.id);
        return APIResponse.successNoData(c, "Monitor unlinked successfully");
    }
);

export { router };
