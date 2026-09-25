import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { DB } from "../server/db";
import { makeAPIRequest } from "./helpers/api";
import { seedUser, seedSession, type SeededUser } from "./helpers/seed";
import { eq } from "drizzle-orm";
import { MonitorStats } from "../server/utils/monitor-stats";

const DAY_MS = 24 * 60 * 60 * 1000;

// Monitors, the single status page (config, groups, monitor links), its public
// read endpoints, admin settings and status page content permissions.

let testAdmin: SeededUser;
let testMember: SeededUser;
let adminToken: string;
let memberToken: string;

const httpMonitor = (name: string, extra: Record<string, any> = {}) => ({
    name,
    type: "http",
    target: "https://example.com",
    interval_seconds: 60,
    timeout_seconds: 10,
    http_method: "GET",
    ...extra,
});

async function createMonitor(name: string, extra: Record<string, any> = {}) {
    return makeAPIRequest("/v1/monitors", {
        method: "POST",
        authToken: adminToken,
        body: httpMonitor(name, extra),
    }, 201);
}

beforeAll(async () => {
    testAdmin = await seedUser("admin", { username: "statusadmin" }, "AdminP@ss1");
    testMember = await seedUser("member", { username: "statusmember" }, "MemberP@ss1");
    adminToken = (await seedSession(testAdmin.id)).token;
    memberToken = (await seedSession(testMember.id)).token;
});

describe("Admin monitor routes", () => {
    let createdMonitorId: number;

    test("POST /monitors creates an HTTP monitor", async () => {
        const created = await makeAPIRequest("/v1/monitors", {
            method: "POST",
            authToken: adminToken,
            body: httpMonitor("HTTP Test Monitor", { expected_http_status: 200 }),
        }, 201);

        expect(created.id).toBeDefined();
        expect(created.name).toBe("HTTP Test Monitor");
        expect(created.type).toBe("http");
        expect(created.http_method).toBe("GET");
        expect(created.expected_http_status).toBe(200);

        createdMonitorId = created.id;
    });

    test("POST /monitors rejects TCP monitor with HTTP fields", async () => {
        await makeAPIRequest("/v1/monitors", {
            method: "POST",
            authToken: adminToken,
            body: {
                name: "TCP Invalid Monitor",
                type: "tcp",
                target: "example.com:443",
                interval_seconds: 60,
                timeout_seconds: 10,
                http_method: "GET",
            }
        }, 400);
    });

    test("POST /monitors requires http_method for HTTP monitor", async () => {
        await makeAPIRequest("/v1/monitors", {
            method: "POST",
            authToken: adminToken,
            body: {
                name: "HTTP Missing Method",
                type: "http",
                target: "https://example.com",
                interval_seconds: 60,
                timeout_seconds: 10,
            }
        }, 400);
    });

    test("POST /monitors with prefill_history fills the past days with up checks", async () => {
        const created = await createMonitor("Prefilled Monitor", { interval_seconds: 300, prefill_history: true });
        expect(created.prefill_history).toBeUndefined();

        const now = Date.now();
        const stats = await MonitorStats.getDailyStats(
            [created.id],
            MonitorStats.dayKey(now - MonitorStats.PREFILL_DAYS * DAY_MS),
            MonitorStats.dayKey(now - DAY_MS),
        );

        expect(stats).toHaveLength(MonitorStats.PREFILL_DAYS);
        for (const day of stats) {
            expect(day.up_count).toBe(288); // one check every 5 minutes
            expect(day.down_count).toBe(0);
            expect(day.response_time_count).toBe(0);
        }

        // Today only holds the placeholder check, which does not grey out the day once real checks arrive.
        await MonitorStats.recordChecks([{ monitor_id: created.id, status: "up", response_time_ms: 50 }]);
        const [today] = await MonitorStats.getDailyStats([created.id], MonitorStats.dayKey(now), MonitorStats.dayKey(now));
        expect(MonitorStats.worstStatus(today)).toBe("up");
    });

    test("POST /monitors without prefill_history has no past history", async () => {
        const created = await createMonitor("Not Prefilled Monitor");
        const now = Date.now();
        const stats = await MonitorStats.getDailyStats(
            [created.id],
            MonitorStats.dayKey(now - MonitorStats.PREFILL_DAYS * DAY_MS),
            MonitorStats.dayKey(now - DAY_MS),
        );
        expect(stats).toHaveLength(0);
    });

    test("PUT /monitors/:monitorId clears HTTP fields when switching to TCP", async () => {
        const monitor = await createMonitor("Switches To TCP", { expected_http_status: 204 });

        const updated = await makeAPIRequest(`/v1/monitors/${monitor.id}`, {
            method: "PUT",
            authToken: adminToken,
            body: { type: "tcp", target: "example.com:443" }
        });

        expect(updated.type).toBe("tcp");
        expect(updated.http_method).toBeNull();
        expect(updated.expected_http_status).toBeNull();
    });

    test("GET /monitors lists monitors", async () => {
        const list = await makeAPIRequest("/v1/monitors", { authToken: adminToken });

        expect(Array.isArray(list)).toBe(true);
        expect(list.some((m: any) => m.id === createdMonitorId)).toBe(true);
    });

    test("GET /monitors/:monitorId returns monitor details", async () => {
        const monitor = await makeAPIRequest(`/v1/monitors/${createdMonitorId}`, { authToken: adminToken });

        expect(monitor.id).toBe(createdMonitorId);
        expect(Array.isArray(monitor.recent_checks)).toBe(true);
    });

    test("PUT /monitors/:monitorId updates monitor", async () => {
        const updated = await makeAPIRequest(`/v1/monitors/${createdMonitorId}`, {
            method: "PUT",
            authToken: adminToken,
            body: { name: "Renamed HTTP Monitor" }
        });

        expect(updated.name).toBe("Renamed HTTP Monitor");

        const dbresult = await DB.instance().select().from(DB.Tables.monitors).where(
            eq(DB.Tables.monitors.id, createdMonitorId)
        ).get();
        expect(dbresult?.name).toBe("Renamed HTTP Monitor");
    });

    test("Member cannot POST /monitors", async () => {
        await makeAPIRequest("/v1/monitors", {
            method: "POST",
            authToken: memberToken,
            body: httpMonitor("Member Monitor"),
        }, 403);
    });

    test("DELETE /monitors/:monitorId removes monitor and its status page link", async () => {
        const monitor = await createMonitor("Delete Me Monitor");

        await makeAPIRequest("/v1/status-page/monitors", {
            method: "POST",
            authToken: adminToken,
            body: { monitor_id: monitor.id }
        }, 201);

        await makeAPIRequest(`/v1/monitors/${monitor.id}`, {
            method: "DELETE",
            authToken: adminToken
        });

        const dbresult = await DB.instance().select().from(DB.Tables.monitors).where(
            eq(DB.Tables.monitors.id, monitor.id)
        ).get();
        expect(dbresult).toBeUndefined();

        const links = await DB.instance().select().from(DB.Tables.monitorGroupAssignments).where(
            eq(DB.Tables.monitorGroupAssignments.monitor_id, monitor.id)
        );
        expect(links).toHaveLength(0);

        await makeAPIRequest(`/v1/monitors/${monitor.id}`, { authToken: adminToken }, 404);
    });
});

describe("Authenticated read monitor routes", () => {

    test("GET /monitors requires authentication", async () => {
        await makeAPIRequest("/v1/monitors", {}, 401);
    });

    test("Member can GET /monitors", async () => {
        const list = await makeAPIRequest("/v1/monitors", { authToken: memberToken });
        expect(Array.isArray(list)).toBe(true);
    });

    test("Member sees disabled monitors on GET /monitors", async () => {
        const disabled = await createMonitor("Disabled Monitor", { is_enabled: false });

        const list = await makeAPIRequest("/v1/monitors", { authToken: memberToken });

        expect(list.some((m: any) => m.id === disabled.id && m.is_enabled === false)).toBe(true);
    });
});

describe("Admin status page routes", () => {
    let monitorId: number;
    let groupId: number;

    test("GET /status-page/config returns full page configuration", async () => {
        const full = await makeAPIRequest("/v1/status-page/config", { authToken: adminToken });

        expect(full.config.id).toBeDefined();
        expect(typeof full.config.title).toBe("string");
        expect(Array.isArray(full.groups)).toBe(true);
        expect(Array.isArray(full.links)).toBe(true);
    });

    test("PUT /status-page updates the page configuration", async () => {
        const updated = await makeAPIRequest("/v1/status-page", {
            method: "PUT",
            authToken: adminToken,
            body: {
                title: "Main Status Page",
                description: "Primary public status page",
            }
        });

        expect(updated.title).toBe("Main Status Page");
        expect(updated.description).toBe("Primary public status page");

        const full = await makeAPIRequest("/v1/status-page/config", { authToken: adminToken });
        expect(full.config.title).toBe("Main Status Page");
    });

    test("PUT /status-page rejects an empty body", async () => {
        await makeAPIRequest("/v1/status-page", {
            method: "PUT",
            authToken: adminToken,
            body: {}
        }, 400);
    });

    test("POST /status-page/groups creates a group", async () => {
        const group = await makeAPIRequest("/v1/status-page/groups", {
            method: "POST",
            authToken: adminToken,
            body: { name: "Core Services", sort_order: 1 }
        }, 201);

        expect(group.name).toBe("Core Services");
        groupId = group.id;
    });

    test("PUT /status-page/groups/:groupId renames group", async () => {
        const updated = await makeAPIRequest(`/v1/status-page/groups/${groupId}`, {
            method: "PUT",
            authToken: adminToken,
            body: { name: "Updated Group Name" }
        });

        expect(updated.name).toBe("Updated Group Name");
    });

    test("PUT /status-page/groups/:groupId returns 404 for unknown group", async () => {
        await makeAPIRequest("/v1/status-page/groups/999999", {
            method: "PUT",
            authToken: adminToken,
            body: { name: "Nope" }
        }, 404);
    });

    test("POST /status-page/monitors links a monitor", async () => {
        const monitor = await createMonitor("Linked Monitor");
        monitorId = monitor.id;

        const result = await makeAPIRequest("/v1/status-page/monitors", {
            method: "POST",
            authToken: adminToken,
            body: {
                monitor_id: monitorId,
                group_id: groupId,
                display_name: "Example Service",
                sort_order: 1,
            }
        }, 201);

        expect(result.link.monitor_id).toBe(monitorId);
        expect(result.link.group_id).toBe(groupId);

        const full = await makeAPIRequest("/v1/status-page/config", { authToken: adminToken });
        expect(full.links.some((l: any) => l.monitor_id === monitorId && l.monitor_name === "Linked Monitor")).toBe(true);
    });

    test("PUT /status-page/groups/reorder updates group order", async () => {
        const result = await makeAPIRequest("/v1/status-page/groups/reorder", {
            method: "PUT",
            authToken: adminToken,
            body: { groups: [{ id: groupId, sort_order: 5 }] }
        });

        expect(result.groups.find((g: any) => g.id === groupId)?.sort_order).toBe(5);
    });

    test("PUT /status-page/monitors/reorder moves a link between groups", async () => {
        const full = await makeAPIRequest("/v1/status-page/config", { authToken: adminToken });
        const link = full.links.find((l: any) => l.monitor_id === monitorId);

        const result = await makeAPIRequest("/v1/status-page/monitors/reorder", {
            method: "PUT",
            authToken: adminToken,
            body: { links: [{ id: link.id, group_id: null, sort_order: 3 }] }
        });

        const moved = result.links.find((l: any) => l.id === link.id);
        expect(moved.group_id).toBeNull();
        expect(moved.sort_order).toBe(3);

        // Move it back for the tests below.
        await makeAPIRequest("/v1/status-page/monitors/reorder", {
            method: "PUT",
            authToken: adminToken,
            body: { links: [{ id: link.id, group_id: groupId, sort_order: 1 }] }
        });
    });

    test("Member can read but cannot write the status page", async () => {
        const page = await makeAPIRequest("/v1/status-page", { authToken: memberToken });
        expect(page.page.title).toBe("Main Status Page");

        await makeAPIRequest("/v1/status-page", {
            method: "PUT",
            authToken: memberToken,
            body: { title: "Member Hijack" }
        }, 403);

        await makeAPIRequest("/v1/status-page/groups", {
            method: "POST",
            authToken: memberToken,
            body: { name: "Member Group" }
        }, 403);

        await makeAPIRequest("/v1/status-page/monitors", {
            method: "POST",
            authToken: memberToken,
            body: { monitor_id: monitorId }
        }, 403);
    });

    test("GET /status-page requires authentication", async () => {
        await makeAPIRequest("/v1/status-page", {}, 401);
    });
});

describe("Public status page routes", () => {
    let enabledId: number;
    let disabledId: number;

    beforeAll(async () => {
        const enabled = await createMonitor("Public Enabled Monitor");
        const disabled = await createMonitor("Public Disabled Monitor", { is_enabled: false });
        enabledId = enabled.id;
        disabledId = disabled.id;

        for (const id of [enabledId, disabledId]) {
            await makeAPIRequest("/v1/status-page/monitors", {
                method: "POST",
                authToken: adminToken,
                body: { monitor_id: id }
            }, 201);
        }

        await makeAPIRequest("/v1/status-page", {
            method: "PUT",
            authToken: adminToken,
            body: { title: "Public Test Page" }
        });
    });

    const allMonitorIds = (page: any): number[] => [
        ...page.ungrouped.map((m: any) => m.id),
        ...page.groups.flatMap((g: any) => g.monitors.map((m: any) => m.id)),
    ];

    test("GET /public/status-page returns the public page", async () => {
        const publicPage = await makeAPIRequest("/v1/public/status-page", {});

        expect(publicPage.page.title).toBe("Public Test Page");
        expect(Array.isArray(publicPage.groups)).toBe(true);
        expect(Array.isArray(publicPage.incidents)).toBe(true);
        expect(Array.isArray(publicPage.maintenance)).toBe(true);
        expect(allMonitorIds(publicPage)).toContain(enabledId);
    });

    test("GET /public/status-page hides disabled monitors", async () => {
        const publicPage = await makeAPIRequest("/v1/public/status-page", {});
        expect(allMonitorIds(publicPage)).not.toContain(disabledId);

        await makeAPIRequest(`/v1/public/monitors/${enabledId}`, {});
        await makeAPIRequest(`/v1/public/monitors/${disabledId}`, {}, 404);
    });

    test("Authenticated GET /status-page includes disabled monitors", async () => {
        const page = await makeAPIRequest("/v1/status-page", { authToken: memberToken });
        expect(allMonitorIds(page)).toContain(disabledId);
    });

    test("The status page has no visibility flags to change", async () => {
        // Unknown fields are stripped, leaving an empty (invalid) update.
        await makeAPIRequest("/v1/status-page", {
            method: "PUT",
            authToken: adminToken,
            body: { is_public: false, is_enabled: false }
        }, 400);

        const publicPage = await makeAPIRequest("/v1/public/status-page", {});
        expect(publicPage.page.is_public).toBeUndefined();
        expect(publicPage.page.is_enabled).toBeUndefined();
    });
});

describe("Admin settings routes", () => {

    test("PUT /admin/settings updates the default theme", async () => {
        const settings = await makeAPIRequest("/v1/admin/settings", {
            method: "PUT",
            authToken: adminToken,
            body: { default_theme: "dark" }
        });

        expect(settings.default_theme).toBe("dark");

        const fetched = await makeAPIRequest("/v1/admin/settings", { authToken: adminToken });
        expect(fetched.default_theme).toBe("dark");
    });

    test("PUT /admin/settings rejects invalid values", async () => {
        await makeAPIRequest("/v1/admin/settings", {
            method: "PUT",
            authToken: adminToken,
            body: { default_theme: "neon" }
        }, 400);

        await makeAPIRequest("/v1/admin/settings", {
            method: "PUT",
            authToken: adminToken,
            body: {}
        }, 400);
    });

    test("Member cannot PUT /admin/settings", async () => {
        await makeAPIRequest("/v1/admin/settings", {
            method: "PUT",
            authToken: memberToken,
            body: { default_theme: "light" }
        }, 403);
    });
});

describe("Status page content routes", () => {

    test("Admin can POST incident", async () => {
        const created = await makeAPIRequest("/v1/status-page/incidents", {
            method: "POST",
            authToken: adminToken,
            body: {
                title: "Service outage",
                message: "We are investigating connectivity issues.",
                status: "investigating",
                severity: "critical",
            }
        }, 201);

        expect(created.title).toBe("Service outage");
        expect(created.status).toBe("investigating");
    });

    test("Admin can POST maintenance", async () => {
        const now = Date.now();
        const created = await makeAPIRequest("/v1/status-page/maintenance", {
            method: "POST",
            authToken: adminToken,
            body: {
                title: "Database upgrade",
                message: "Scheduled maintenance window.",
                status: "scheduled",
                scheduled_start_at: now,
                scheduled_end_at: now + 3600_000,
            }
        }, 201);

        expect(created.title).toBe("Database upgrade");
        expect(created.status).toBe("scheduled");
    });

    test("Member cannot POST content", async () => {
        await makeAPIRequest("/v1/status-page/incidents", {
            method: "POST",
            authToken: memberToken,
            body: { title: "Member incident", message: "nope", status: "investigating", severity: "minor" }
        }, 403);

        await makeAPIRequest("/v1/status-page/maintenance", {
            method: "POST",
            authToken: memberToken,
            body: { title: "Member maintenance", message: "nope", status: "scheduled", scheduled_start_at: Date.now() }
        }, 403);
    });

    test("Admin can update incident; member can list incidents", async () => {
        const incident = await makeAPIRequest("/v1/status-page/incidents", {
            method: "POST",
            authToken: adminToken,
            body: {
                title: "Updateable incident",
                message: "Details here.",
                status: "investigating",
                severity: "minor",
            }
        }, 201);

        const updated = await makeAPIRequest(`/v1/status-page/incidents/${incident.id}`, {
            method: "PUT",
            authToken: adminToken,
            body: { status: "resolved" }
        });

        expect(updated.status).toBe("resolved");
        expect(updated.is_resolved).toBe(true);

        const list = await makeAPIRequest("/v1/status-page/incidents", { authToken: memberToken });
        expect(list.length).toBeGreaterThanOrEqual(2);
    });

    test("Public can read content", async () => {
        const incidents = await makeAPIRequest("/v1/public/status-page/incidents", {});
        const maintenance = await makeAPIRequest("/v1/public/status-page/maintenance", {});

        expect(Array.isArray(incidents)).toBe(true);
        expect(incidents.length).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(maintenance)).toBe(true);
        expect(maintenance.length).toBeGreaterThanOrEqual(1);
    });

    test("Guest cannot POST content", async () => {
        await makeAPIRequest("/v1/status-page/incidents", {
            method: "POST",
            body: { title: "Guest incident", message: "nope", status: "investigating", severity: "minor" }
        }, 401);
    });
});
