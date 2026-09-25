import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { API } from "../server/lib/api";
import { DB } from "../server/db";
import { makeAPIRequest } from "./helpers/api";
import { seedUser, seedSession } from "./helpers/seed";

// Update entries attached to incidents and scheduled maintenance: posting,
// editing and deleting updates, parent status syncing, scoping, permissions,
// and the public read endpoints that embed update timelines.

let adminToken: string;
let memberToken: string;

beforeAll(async () => {
    const admin = await seedUser("admin", { username: "updates_admin" });
    const member = await seedUser("member", { username: "updates_member" });
    adminToken = (await seedSession(admin.id)).token;
    memberToken = (await seedSession(member.id)).token;
});

async function createIncident(title = "API outage") {
    return makeAPIRequest("/v1/status-page/incidents", {
        method: "POST",
        authToken: adminToken,
        body: { title, message: "We are investigating elevated error rates.", status: "investigating", severity: "major" }
    }, 201);
}

async function createMaintenance(title = "Database upgrade") {
    return makeAPIRequest("/v1/status-page/maintenance", {
        method: "POST",
        authToken: adminToken,
        body: { title, message: "Planned database upgrade.", status: "scheduled", scheduled_start_at: Date.now() + 3_600_000 }
    }, 201);
}

describe("Incident updates", () => {

    test("posting an update stores it and syncs the incident status", async () => {
        const incident = await createIncident();

        const update = await makeAPIRequest(`/v1/status-page/incidents/${incident.id}/updates`, {
            method: "POST",
            authToken: adminToken,
            body: { message: "Root cause identified: a bad deploy.", status: "identified" }
        }, 201);

        expect(update.parent_type).toBe("incident");
        expect(update.parent_id).toBe(incident.id);
        expect(update.status).toBe("identified");

        const detail = await makeAPIRequest(`/v1/status-page/incidents/${incident.id}`, { authToken: adminToken });
        expect(detail.status).toBe("identified");
        expect(detail.is_resolved).toBe(false);
        expect(detail.updates).toHaveLength(1);
        expect(detail.updates[0].message).toBe("Root cause identified: a bad deploy.");
    });

    test("a resolved update resolves the incident; a later update re-opens it", async () => {
        const incident = await createIncident("Login failures");

        await makeAPIRequest(`/v1/status-page/incidents/${incident.id}/updates`, {
            method: "POST",
            authToken: adminToken,
            body: { message: "Fixed.", status: "resolved" }
        }, 201);

        let detail = await makeAPIRequest(`/v1/status-page/incidents/${incident.id}`, { authToken: adminToken });
        expect(detail.status).toBe("resolved");
        expect(detail.is_resolved).toBe(true);
        expect(typeof detail.resolved_at).toBe("number");

        await makeAPIRequest(`/v1/status-page/incidents/${incident.id}/updates`, {
            method: "POST",
            authToken: adminToken,
            body: { message: "Errors are back, monitoring closely.", status: "monitoring" }
        }, 201);

        detail = await makeAPIRequest(`/v1/status-page/incidents/${incident.id}`, { authToken: adminToken });
        expect(detail.status).toBe("monitoring");
        expect(detail.is_resolved).toBe(false);
        expect(detail.resolved_at).toBeNull();
        // Newest first
        expect(detail.updates.map((u: any) => u.status)).toEqual(["monitoring", "resolved"]);
    });

    test("editing an update changes its message and re-syncs status", async () => {
        const incident = await createIncident("Slow dashboard");
        const update = await makeAPIRequest(`/v1/status-page/incidents/${incident.id}/updates`, {
            method: "POST",
            authToken: adminToken,
            body: { message: "Typo in mesage", status: "identified" }
        }, 201);

        const edited = await makeAPIRequest(`/v1/status-page/incidents/${incident.id}/updates/${update.id}`, {
            method: "PUT",
            authToken: adminToken,
            body: { message: "Typo in message fixed", status: "monitoring" }
        });
        expect(edited.message).toBe("Typo in message fixed");
        expect(edited.status).toBe("monitoring");

        const detail = await makeAPIRequest(`/v1/status-page/incidents/${incident.id}`, { authToken: adminToken });
        expect(detail.status).toBe("monitoring");
    });

    test("updates are scoped to their parent incident", async () => {
        const first = await createIncident("First");
        const second = await createIncident("Second");
        const update = await makeAPIRequest(`/v1/status-page/incidents/${first.id}/updates`, {
            method: "POST",
            authToken: adminToken,
            body: { message: "Belongs to first", status: "identified" }
        }, 201);

        await makeAPIRequest(`/v1/status-page/incidents/${second.id}/updates/${update.id}`, {
            method: "PUT",
            authToken: adminToken,
            body: { message: "Hijacked" }
        }, 404);

        await makeAPIRequest(`/v1/status-page/incidents/${second.id}/updates/${update.id}`, {
            method: "DELETE",
            authToken: adminToken
        }, 404);

        // A maintenance route must not reach an incident update either
        const maintenance = await createMaintenance("Unrelated");
        await makeAPIRequest(`/v1/status-page/maintenance/${maintenance.id}/updates/${update.id}`, {
            method: "DELETE",
            authToken: adminToken
        }, 404);

        const detail = await makeAPIRequest(`/v1/status-page/incidents/${first.id}`, { authToken: adminToken });
        expect(detail.updates).toHaveLength(1);
        expect(detail.updates[0].message).toBe("Belongs to first");
    });

    test("deleting an update removes it without touching the incident status", async () => {
        const incident = await createIncident("Flaky webhooks");
        const update = await makeAPIRequest(`/v1/status-page/incidents/${incident.id}/updates`, {
            method: "POST",
            authToken: adminToken,
            body: { message: "Identified.", status: "identified" }
        }, 201);

        await makeAPIRequest(`/v1/status-page/incidents/${incident.id}/updates/${update.id}`, {
            method: "DELETE",
            authToken: adminToken
        });

        const detail = await makeAPIRequest(`/v1/status-page/incidents/${incident.id}`, { authToken: adminToken });
        expect(detail.updates).toHaveLength(0);
        expect(detail.status).toBe("identified");
    });

    test("deleting an incident also deletes its updates", async () => {
        const incident = await createIncident("To be deleted");
        await makeAPIRequest(`/v1/status-page/incidents/${incident.id}/updates`, {
            method: "POST",
            authToken: adminToken,
            body: { message: "Will be removed with the incident.", status: "identified" }
        }, 201);

        await makeAPIRequest(`/v1/status-page/incidents/${incident.id}`, {
            method: "DELETE",
            authToken: adminToken
        });

        const orphans = await DB.instance().select().from(DB.Tables.statusUpdates)
            .where(eq(DB.Tables.statusUpdates.parent_id, incident.id));
        expect(orphans.filter((u) => u.parent_type === "incident")).toHaveLength(0);
    });

    test("rejects a maintenance status on an incident update", async () => {
        const incident = await createIncident("Validation");
        await makeAPIRequest(`/v1/status-page/incidents/${incident.id}/updates`, {
            method: "POST",
            authToken: adminToken,
            body: { message: "Wrong status enum", status: "in_progress" }
        }, 400);
    });

    test("members can read but not post; guests cannot read", async () => {
        const incident = await createIncident("Permissions");

        await makeAPIRequest(`/v1/status-page/incidents/${incident.id}/updates`, {
            method: "POST",
            authToken: memberToken,
            body: { message: "Member attempt", status: "identified" }
        }, 403);

        const list = await makeAPIRequest(`/v1/status-page/incidents/${incident.id}/updates`, { authToken: memberToken });
        expect(Array.isArray(list)).toBe(true);

        await makeAPIRequest(`/v1/status-page/incidents/${incident.id}/updates`, {}, 401);
    });

    test("authenticated status-page reads reject guests", async () => {
        for (const path of [
            "/v1/status-page",
            "/v1/status-page/config",
            "/v1/status-page/incidents",
            "/v1/status-page/maintenance",
        ]) {
            await makeAPIRequest(path, {}, 401);
        }
    });

    test("unknown incident returns 404", async () => {
        await makeAPIRequest(`/v1/status-page/incidents/999999/updates`, {
            method: "POST",
            authToken: adminToken,
            body: { message: "Nope", status: "identified" }
        }, 404);
    });
});

describe("Maintenance updates", () => {

    test("posting an update syncs the maintenance status", async () => {
        const maintenance = await createMaintenance();

        await makeAPIRequest(`/v1/status-page/maintenance/${maintenance.id}/updates`, {
            method: "POST",
            authToken: adminToken,
            body: { message: "Maintenance has started.", status: "in_progress" }
        }, 201);

        const detail = await makeAPIRequest(`/v1/status-page/maintenance/${maintenance.id}`, { authToken: adminToken });
        expect(detail.status).toBe("in_progress");
        expect(detail.updates).toHaveLength(1);
        expect(detail.updates[0].parent_type).toBe("maintenance");
    });

    test("list endpoint embeds updates for each entry", async () => {
        const maintenance = await createMaintenance("Network work");
        await makeAPIRequest(`/v1/status-page/maintenance/${maintenance.id}/updates`, {
            method: "POST",
            authToken: adminToken,
            body: { message: "Completed early.", status: "completed" }
        }, 201);

        const list = await makeAPIRequest("/v1/status-page/maintenance", { authToken: adminToken });
        const entry = list.find((m: any) => m.id === maintenance.id);
        expect(entry.status).toBe("completed");
        expect(entry.updates.map((u: any) => u.message)).toEqual(["Completed early."]);
    });
});

describe("Public update timelines", () => {

    test("public incident detail embeds the update timeline", async () => {
        const incident = await createIncident("Public incident");
        await makeAPIRequest(`/v1/status-page/incidents/${incident.id}/updates`, {
            method: "POST",
            authToken: adminToken,
            body: { message: "Public progress note.", status: "monitoring" }
        }, 201);

        const data = await makeAPIRequest(`/v1/public/incidents/${incident.id}`);
        expect(data.incident.id).toBe(incident.id);
        expect(data.incident.status).toBe("monitoring");
        expect(data.incident.updates[0].message).toBe("Public progress note.");

        await makeAPIRequest(`/v1/public/incidents/999999`, {}, 404);
    });

    test("public maintenance detail embeds the update timeline", async () => {
        const maintenance = await createMaintenance("Public maintenance");
        await makeAPIRequest(`/v1/status-page/maintenance/${maintenance.id}/updates`, {
            method: "POST",
            authToken: adminToken,
            body: { message: "Starting now.", status: "in_progress" }
        }, 201);

        const data = await makeAPIRequest(`/v1/public/maintenance/${maintenance.id}`);
        expect(data.maintenance.status).toBe("in_progress");
        expect(data.maintenance.updates[0].message).toBe("Starting now.");
    });

    test("public status page embeds updates and no longer has a standalone updates list", async () => {
        const data = await makeAPIRequest("/v1/public/status-page");
        expect(data).not.toHaveProperty("updates");
        expect(data.incidents.length).toBeGreaterThan(0);
        for (const incident of data.incidents) {
            expect(Array.isArray(incident.updates)).toBe(true);
        }
        for (const entry of data.maintenance) {
            expect(Array.isArray(entry.updates)).toBe(true);
        }

        await makeAPIRequest("/v1/public/status-page/updates", {}, 404);
    });

    test("Atom feed includes update entries linking to the detail pages", async () => {
        const incident = await createIncident("Feed incident");
        await makeAPIRequest(`/v1/status-page/incidents/${incident.id}/updates`, {
            method: "POST",
            authToken: adminToken,
            body: { message: "Feed <update> & escaping check", status: "identified" }
        }, 201);

        const res = await API.getApp().request("/v1/public/status-page/feed");
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("application/atom+xml");

        const xml = await res.text();
        expect(xml).toContain(`<title>Update: Feed incident</title>`);
        expect(xml).toContain(`/incident/${incident.id}"`);
        expect(xml).toContain(`term="incident-update"`);
        // Message is escaped inside the HTML content
        expect(xml).not.toContain("<update>");
    });
});