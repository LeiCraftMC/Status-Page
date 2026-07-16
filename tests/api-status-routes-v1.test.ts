import { beforeAll, describe, expect, test } from "bun:test";
import { DB } from "../server/db";
import { makeAPIRequest } from "./helpers/api";
import { seedUser, seedSession, type SeededUser } from "./helpers/seed";
import { eq } from "drizzle-orm";

let testAdmin: SeededUser;
let testMember: SeededUser;

beforeAll(async () => {
    testAdmin = await seedUser("admin", { username: "statusadmin" }, "AdminP@ss1");
    testMember = await seedUser("member", { username: "statusmember" }, "MemberP@ss1");
});

describe("Admin monitor routes", async () => {
    let adminToken: string;
    let createdMonitorId: number;

    beforeAll(async () => {
        adminToken = await seedSession(testAdmin.id).then(s => s.token);
    });

    test("POST /admin/monitors creates an HTTP monitor", async () => {
        const created = await makeAPIRequest("/v1/admin/monitors", {
            method: "POST",
            authToken: adminToken,
            body: {
                name: "HTTP Test Monitor",
                type: "http",
                target: "https://example.com",
                interval_seconds: 60,
                timeout_seconds: 10,
                http_method: "GET",
                expected_http_status: 200,
            }
        });

        expect(created.id).toBeDefined();
        expect(created.name).toBe("HTTP Test Monitor");
        expect(created.type).toBe("http");
        expect(created.http_method).toBe("GET");

        createdMonitorId = created.id;
    });

    test("POST /admin/monitors rejects TCP monitor with HTTP fields", async () => {
        await makeAPIRequest("/v1/admin/monitors", {
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

    test("POST /admin/monitors requires http_method for HTTP monitor", async () => {
        await makeAPIRequest("/v1/admin/monitors", {
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

    test("GET /admin/monitors lists monitors", async () => {
        const list = await makeAPIRequest("/v1/admin/monitors", {
            authToken: adminToken
        });

        expect(Array.isArray(list)).toBe(true);
        expect(list.some((m: any) => m.id === createdMonitorId)).toBe(true);
    });

    test("GET /admin/monitors/:monitorId returns monitor details", async () => {
        const monitor = await makeAPIRequest(`/v1/admin/monitors/${createdMonitorId}`, {
            authToken: adminToken
        });

        expect(monitor.id).toBe(createdMonitorId);
    });

    test("PUT /admin/monitors/:monitorId updates monitor", async () => {
        const updated = await makeAPIRequest(`/v1/admin/monitors/${createdMonitorId}`, {
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

    test("Member cannot POST /admin/monitors", async () => {
        const memberToken = await seedSession(testMember.id).then(s => s.token);
        await makeAPIRequest("/v1/admin/monitors", {
            method: "POST",
            authToken: memberToken,
            body: {
                name: "Member Monitor",
                type: "http",
                target: "https://example.com",
                interval_seconds: 60,
                timeout_seconds: 10,
                http_method: "GET",
            }
        }, 403);
    });

    test("DELETE /admin/monitors/:monitorId removes monitor and links", async () => {
        const monitor = await makeAPIRequest("/v1/admin/monitors", {
            method: "POST",
            authToken: adminToken,
            body: {
                name: "Delete Me Monitor",
                type: "http",
                target: "https://example.com",
                interval_seconds: 60,
                timeout_seconds: 10,
                http_method: "GET",
            }
        });

        await makeAPIRequest(`/v1/admin/monitors/${monitor.id}`, {
            method: "DELETE",
            authToken: adminToken
        });

        const dbresult = await DB.instance().select().from(DB.Tables.monitors).where(
            eq(DB.Tables.monitors.id, monitor.id)
        ).get();
        expect(dbresult).toBeUndefined();
    });
});

describe("Authenticated read monitor routes", async () => {
    let adminToken: string;
    let memberToken: string;

    beforeAll(async () => {
        adminToken = await seedSession(testAdmin.id).then(s => s.token);
        memberToken = await seedSession(testMember.id).then(s => s.token);
    });

    test("GET /monitors requires authentication", async () => {
        await makeAPIRequest("/v1/monitors", {}, 401);
    });

    test("Member can GET /monitors", async () => {
        const list = await makeAPIRequest("/v1/monitors", {
            authToken: memberToken
        });

        expect(Array.isArray(list)).toBe(true);
    });

    test("Member sees disabled monitors on GET /monitors", async () => {
        const adminToken = await seedSession(testAdmin.id).then(s => s.token);
        const disabled = await makeAPIRequest("/v1/admin/monitors", {
            method: "POST",
            authToken: adminToken,
            body: {
                name: "Disabled Monitor",
                type: "http",
                target: "https://example.com",
                interval_seconds: 60,
                timeout_seconds: 10,
                http_method: "GET",
                is_enabled: false,
            }
        });

        const list = await makeAPIRequest("/v1/monitors", {
            authToken: memberToken
        });

        expect(list.some((m: any) => m.id === disabled.id && m.is_enabled === false)).toBe(true);
    });
});

describe("Admin status page routes", async () => {
    let adminToken: string;
    let pageId: number;
    let monitorId: number;
    let groupId: number;

    beforeAll(async () => {
        adminToken = await seedSession(testAdmin.id).then(s => s.token);
    });

    test("POST /admin/status-pages creates a status page", async () => {
        const page = await makeAPIRequest("/v1/admin/status-pages", {
            method: "POST",
            authToken: adminToken,
            body: {
                slug: "main",
                title: "Main Status Page",
                description: "Primary public status page",
            }
        });

        expect(page.slug).toBe("main");
        expect(page.title).toBe("Main Status Page");

        pageId = page.id;
    });

    test("POST /admin/status-pages rejects duplicate slug", async () => {
        await makeAPIRequest("/v1/admin/status-pages", {
            method: "POST",
            authToken: adminToken,
            body: {
                slug: "main",
                title: "Duplicate",
            }
        }, 409);
    });

    test("GET /admin/status-pages/:pageId returns full page", async () => {
        const full = await makeAPIRequest(`/v1/admin/status-pages/${pageId}`, {
            authToken: adminToken
        });

        expect(full.page.id).toBe(pageId);
        expect(full.groups).toEqual([]);
        expect(full.links).toEqual([]);
    });

    test("POST /admin/status-pages/:pageId/groups creates a group", async () => {
        const group = await makeAPIRequest(`/v1/admin/status-pages/${pageId}/groups`, {
            method: "POST",
            authToken: adminToken,
            body: { name: "Core Services", sort_order: 1 }
        });

        expect(group.name).toBe("Core Services");
        groupId = group.id;
    });

    test("PUT /admin/status-pages/:pageId/groups/:groupId renames group", async () => {
        const updated = await makeAPIRequest(`/v1/admin/status-pages/${pageId}/groups/${groupId}`, {
            method: "PUT",
            authToken: adminToken,
            body: { name: "Updated Group Name" }
        });

        expect(updated.name).toBe("Updated Group Name");
    });

    test("POST /admin/status-pages/:pageId/monitors links a monitor", async () => {
        const monitor = await makeAPIRequest("/v1/admin/monitors", {
            method: "POST",
            authToken: adminToken,
            body: {
                name: "Linked Monitor",
                type: "http",
                target: "https://example.com",
                interval_seconds: 60,
                timeout_seconds: 10,
                http_method: "GET",
            }
        });
        monitorId = monitor.id;

        const result = await makeAPIRequest(`/v1/admin/status-pages/${pageId}/monitors`, {
            method: "POST",
            authToken: adminToken,
            body: {
                monitor_id: monitorId,
                group_id: groupId,
                display_name: "Example Service",
                sort_order: 1,
            }
        });

        expect(result.link.monitor_id).toBe(monitorId);
        expect(result.link.group_id).toBe(groupId);
    });

    test("Member cannot write status pages", async () => {
        const memberToken = await seedSession(testMember.id).then(s => s.token);
        await makeAPIRequest(`/v1/admin/status-pages/${pageId}`, {
            method: "PUT",
            authToken: memberToken,
            body: { title: "Member Hijack" }
        }, 403);
    });
});

describe("Authenticated status page read routes", async () => {
    let adminToken: string;
    let memberToken: string;

    beforeAll(async () => {
        adminToken = await seedSession(testAdmin.id).then(s => s.token);
        memberToken = await seedSession(testMember.id).then(s => s.token);
    });

    test("Member can GET /status-pages including private/disabled", async () => {
        const privatePage = await makeAPIRequest("/v1/admin/status-pages", {
            method: "POST",
            authToken: adminToken,
            body: {
                slug: "member-private",
                title: "Member Private Page",
                is_public: false,
                is_enabled: false,
            }
        });

        const list = await makeAPIRequest("/v1/status-pages", {
            authToken: memberToken
        });

        expect(list.some((p: any) => p.id === privatePage.id)).toBe(true);

        const full = await makeAPIRequest(`/v1/status-pages/member-private`, {
            authToken: memberToken
        });
        expect(full.page.id).toBe(privatePage.id);

        await makeAPIRequest(`/v1/admin/status-pages/${privatePage.id}`, {
            method: "DELETE",
            authToken: adminToken
        });
    });
});

describe("Public status page routes", async () => {
    let adminToken: string;
    let pageId: number;

    beforeAll(async () => {
        adminToken = await seedSession(testAdmin.id).then(s => s.token);
    });

    test("GET /public/status-pages/root returns 404 when unset", async () => {
        await makeAPIRequest("/v1/public/status-pages/root", {}, 404);
    });

    test("GET /public/status-pages/:slug returns public page", async () => {
        const page = await makeAPIRequest("/v1/admin/status-pages", {
            method: "POST",
            authToken: adminToken,
            body: {
                slug: "public-test",
                title: "Public Test Page",
                is_public: true,
                is_enabled: true,
            }
        });
        pageId = page.id;

        const publicPage = await makeAPIRequest("/v1/public/status-pages/public-test", {});
        expect(publicPage.page.title).toBe("Public Test Page");
    });

    test("GET /public/status-pages/:slug returns 404 for private page", async () => {
        const privatePage = await makeAPIRequest("/v1/admin/status-pages", {
            method: "POST",
            authToken: adminToken,
            body: {
                slug: "private-test",
                title: "Private Test Page",
                is_public: false,
                is_enabled: true,
            }
        });

        await makeAPIRequest("/v1/public/status-pages/private-test", {}, 404);

        // Cleanup
        await makeAPIRequest(`/v1/admin/status-pages/${privatePage.id}`, {
            method: "DELETE",
            authToken: adminToken
        });
    });
});

describe("Admin settings routes", async () => {
    let adminToken: string;
    let pageId: number;

    beforeAll(async () => {
        adminToken = await seedSession(testAdmin.id).then(s => s.token);

        const page = await makeAPIRequest("/v1/admin/status-pages", {
            method: "POST",
            authToken: adminToken,
            body: {
                slug: "root-candidate",
                title: "Root Candidate",
            }
        });
        pageId = page.id;
    });

    test("PUT /admin/settings sets root status page", async () => {
        const settings = await makeAPIRequest("/v1/admin/settings", {
            method: "PUT",
            authToken: adminToken,
            body: { root_status_page_id: pageId, default_theme: "dark" }
        });

        expect(settings.root_status_page_id).toBe(pageId);
        expect(settings.default_theme).toBe("dark");
    });

    test("GET /public/status-pages/root returns configured page", async () => {
        const root = await makeAPIRequest("/v1/public/status-pages/root", {});
        expect(root.page.id).toBe(pageId);
    });

    test("PUT /admin/settings rejects invalid root page id", async () => {
        await makeAPIRequest("/v1/admin/settings", {
            method: "PUT",
            authToken: adminToken,
            body: { root_status_page_id: 999999 }
        }, 404);
    });

    test("Member cannot PUT /admin/settings", async () => {
        const memberToken = await seedSession(testMember.id).then(s => s.token);
        await makeAPIRequest("/v1/admin/settings", {
            method: "PUT",
            authToken: memberToken,
            body: { default_theme: "light" }
        }, 403);
    });
});

describe("Status page content routes", async () => {
    let adminToken: string;
    let memberToken: string;
    let pageId: number;

    beforeAll(async () => {
        adminToken = await seedSession(testAdmin.id).then(s => s.token);
        memberToken = await seedSession(testMember.id).then(s => s.token);

        const page = await makeAPIRequest("/v1/admin/status-pages", {
            method: "POST",
            authToken: adminToken,
            body: {
                slug: "content-page",
                title: "Content Test Page",
                is_public: true,
                is_enabled: true,
            }
        });
        pageId = page.id;
    });

    test("Member can POST incident", async () => {
        const created = await makeAPIRequest("/v1/status-pages/content-page/incidents", {
            method: "POST",
            authToken: memberToken,
            body: {
                title: "Service outage",
                message: "We are investigating connectivity issues.",
                status: "investigating",
                severity: "critical",
            }
        });

        expect(created.title).toBe("Service outage");
        expect(created.status).toBe("investigating");
    });

    test("Member can POST maintenance", async () => {
        const now = Date.now();
        const created = await makeAPIRequest("/v1/status-pages/content-page/maintenance", {
            method: "POST",
            authToken: memberToken,
            body: {
                title: "Database upgrade",
                message: "Scheduled maintenance window.",
                status: "scheduled",
                scheduled_start_at: now,
                scheduled_end_at: now + 3600_000,
            }
        });

        expect(created.title).toBe("Database upgrade");
        expect(created.status).toBe("scheduled");
    });

    test("Member can POST update", async () => {
        const created = await makeAPIRequest("/v1/status-pages/content-page/updates", {
            method: "POST",
            authToken: memberToken,
            body: {
                title: "General update",
                message: "Everything is running smoothly.",
                type: "general",
            }
        });

        expect(created.title).toBe("General update");
        expect(created.type).toBe("general");
    });

    test("Member can list and update incident", async () => {
        const incident = await makeAPIRequest("/v1/status-pages/content-page/incidents", {
            method: "POST",
            authToken: memberToken,
            body: {
                title: "Updateable incident",
                message: "Details here.",
                status: "investigating",
                severity: "minor",
            }
        });

        const updated = await makeAPIRequest(`/v1/status-pages/content-page/incidents/${incident.id}`, {
            method: "PUT",
            authToken: memberToken,
            body: { status: "resolved" }
        });

        expect(updated.status).toBe("resolved");
        expect(updated.is_resolved).toBe(true);

        const list = await makeAPIRequest("/v1/status-pages/content-page/incidents", {
            authToken: memberToken
        });
        expect(list.length).toBeGreaterThanOrEqual(2);
    });

    test("Public can read content", async () => {
        const incidents = await makeAPIRequest("/v1/public/status-pages/content-page/incidents", {});
        const maintenance = await makeAPIRequest("/v1/public/status-pages/content-page/maintenance", {});
        const updates = await makeAPIRequest("/v1/public/status-pages/content-page/updates", {});

        expect(Array.isArray(incidents)).toBe(true);
        expect(incidents.length).toBeGreaterThanOrEqual(1);
        expect(Array.isArray(maintenance)).toBe(true);
        expect(Array.isArray(updates)).toBe(true);
    });

    test("Guest cannot POST content", async () => {
        await makeAPIRequest("/v1/status-pages/content-page/updates", {
            method: "POST",
            body: { title: "Guest update", message: "nope", type: "general" }
        }, 401);
    });
});
