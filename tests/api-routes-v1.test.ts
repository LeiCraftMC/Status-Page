import { beforeAll, describe, expect, test } from "bun:test";
import { API } from "../server/lib/api";
import { DB } from "../server/db";
import { AuthHandler, AuthUtils, SessionHandler } from "../server/lib/api/utils/authHandler";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { makeAPIRequest } from "./helpers/api";
import { seedUser, seedSession, type SeededUser } from "./helpers/seed";
import { AccountModel } from "../server/lib/api/versions/v1/routes/account/model";
import { UsersModel } from "../server/lib/api/versions/v1/routes/admin/users/model";

let testUser: SeededUser;
let testAdmin: SeededUser;

beforeAll(async () => {
    testUser = await seedUser("member", { username: "testuser" }, "UserP@ss1");
    testAdmin = await seedUser("admin", { username: "testadmin" }, "AdminP@ss1");
});

describe("Auth routes", async () => {
    let sessionToken: string;

    test("POST /auth/login authenticates and creates a session", async () => {
        const data = await makeAPIRequest("/v1/auth/login", {
            method: "POST",
            body: { username: testUser.username, password: testUser.password }
        });

        expect(data.token.startsWith("lccfwsp_sess_")).toBe(true);
        sessionToken = data.token;

        const session = await AuthHandler.getAuthContext(data.token);
        expect(session).toBeDefined();
        if (!session) return;

        expect(session.user_id).toBe(testUser.id);
        expect(session.user_role).toBe("member");
        expect(session.type).toBe("session");
        expect(session.expires_at).toBeGreaterThan(Date.now());

        const tokenParts = AuthUtils.getTokenParts(data.token);
        expect(tokenParts).toBeDefined();
        if (!tokenParts) return;

        expect(await AuthUtils.verifyHashedTokenBase(tokenParts.base, session.hashed_token)).toBe(true);
        expect(tokenParts.prefix).toBe("lccfwsp_sess_");
        expect(tokenParts.id).toBe(session.id);
    });

    test("POST /auth/login with invalid credentials fails", async () => {
        await makeAPIRequest("/v1/auth/login", {
            method: "POST",
            body: { username: testUser.username, password: "WrongPassword" }
        }, 401);
    });

    test("GET /auth/session returns current session info", async () => {
        const data = await makeAPIRequest("/v1/auth/session", {
            authToken: sessionToken
        });

        expect(data.user_id).toBe(testUser.id);
        expect(data.user_role).toBe("member");
    });

    test("GET /auth/session with invalid token fails", async () => {
        await makeAPIRequest("/v1/auth/session", {
            authToken: "invalid_token"
        }, 401);
    });

    test("GET /auth/session with empty bearer token fails", async () => {
        await makeAPIRequest("/v1/auth/session", {
            additionalOptions: {
                headers: { Authorization: "Bearer " }
            }
        }, 401);
    });

    test("POST /auth/logout invalidates session", async () => {
        await makeAPIRequest("/v1/auth/logout", {
            method: "POST",
            authToken: sessionToken
        });

        const session = await AuthHandler.getAuthContext(sessionToken);
        expect(session).toBeNil();
    });
});

describe("Account routes", async () => {
    let sessionToken: string;

    beforeAll(async () => {
        sessionToken = await seedSession(testUser.id);
    });

    test("GET /account returns current user", async () => {
        const data = await makeAPIRequest("/v1/account", {
            authToken: sessionToken
        });

        expect(data.id).toBe(testUser.id);
        expect(data.username).toBe(testUser.username);
        expect(data.display_name).toBe(testUser.display_name);
        expect(data.email).toBe(testUser.email);
        expect(data.role).toBe("member");
    });

    test("PUT /account updates profile fields", async () => {
        const newUserData = {
            display_name: "Updated Name",
            username: "updatedusername",
            email: "updated@example.com",
            current_password: testUser.password
        };

        await makeAPIRequest("/v1/account", {
            method: "PUT",
            authToken: sessionToken,
            body: newUserData
        });

        testUser.display_name = newUserData.display_name;
        testUser.username = newUserData.username;
        testUser.email = newUserData.email;

        const dbresult = DB.instance().select().from(DB.Tables.users).where(eq(DB.Tables.users.id, testUser.id)).get();
        expect(dbresult?.display_name).toBe(newUserData.display_name);
        expect(dbresult?.username).toBe(newUserData.username);
        expect(dbresult?.email).toBe(newUserData.email);
    });

    test("PUT /account try updating role fails", async () => {
        await makeAPIRequest("/v1/account", {
            method: "PUT",
            authToken: sessionToken,
            body: { role: "admin" }
        }, 400);

        const dbresult = DB.instance().select().from(DB.Tables.users).where(eq(DB.Tables.users.id, testUser.id)).get();
        expect(dbresult?.role).toBe("member");
    });

    test("PUT /account/password rotates credentials and invalidates old sessions", async () => {
        const oldPassword = testUser.password;
        const newPassword = "NewP@ssw0rd1";

        await makeAPIRequest("/v1/account/password", {
            method: "PUT",
            authToken: sessionToken,
            body: {
                current_password: oldPassword,
                new_password: newPassword
            }
        });

        testUser.password = newPassword;

        await makeAPIRequest("/v1/account", {
            authToken: sessionToken
        }, 401);

        await makeAPIRequest("/v1/auth/login", {
            method: "POST",
            body: { username: testUser.username, password: oldPassword }
        }, 401);

        const data = await makeAPIRequest("/v1/auth/login", {
            method: "POST",
            body: { username: testUser.username, password: newPassword }
        });

        expect(data.token.startsWith("lccfwsp_sess_")).toBe(true);
        sessionToken = data.token;
    });

    test("DELETE /account removes user", async () => {
        const tempUser = await seedUser("member", {}, "DeleteP@ss1");
        const tempToken = await seedSession(tempUser.id);

        await makeAPIRequest("/v1/account", {
            method: "DELETE",
            authToken: tempToken
        });

        const dbresult = DB.instance().select().from(DB.Tables.users).where(eq(DB.Tables.users.id, tempUser.id)).get();
        expect(dbresult).toBeUndefined();
    });
});

describe("Admin users routes", async () => {
    let adminToken: string;
    let userToken: string;

    beforeAll(async () => {
        adminToken = await seedSession(testAdmin.id);
        userToken = await seedSession(testUser.id);
    });

    test("GET /admin/users requires admin role", async () => {
        await makeAPIRequest("/v1/admin/users", {
            authToken: userToken
        }, 403);

        const list = await makeAPIRequest("/v1/admin/users", {
            authToken: adminToken
        });

        expect(Array.isArray(list)).toBe(true);
        expect(list.some((u: any) => u.username === testAdmin.username)).toBe(true);
    });

    test("POST /admin/users creates a new user", async () => {
        const username = `created_${randomUUID().slice(0, 8)}`;
        const created = await makeAPIRequest("/v1/admin/users", {
            method: "POST",
            authToken: adminToken,
            body: {
                username,
                display_name: "Created User",
                email: `${randomUUID()}@example.com`,
                password: "CreatedP@ss1",
                role: "member"
            }
        });

        expect(created.username).toBe(username);
        expect(created.role).toBe("member");
    });

    test("GET /admin/users/:userId returns user details", async () => {
        const data = await makeAPIRequest(`/v1/admin/users/${testUser.id}`, {
            authToken: adminToken
        });

        expect(data.id).toBe(testUser.id);
        expect(data.username).toBe(testUser.username);
    });

    test("PUT /admin/users/:userId updates user role", async () => {
        const target = await seedUser("member", {}, "RoleP@ss1");

        const updated = await makeAPIRequest(`/v1/admin/users/${target.id}`, {
            method: "PUT",
            authToken: adminToken,
            body: { role: "admin" }
        });

        expect(updated.role).toBe("admin");
    });

    test("DELETE /admin/users/:userId removes user", async () => {
        const target = await seedUser("member", {}, "DeleteAdminP@ss1");

        await makeAPIRequest(`/v1/admin/users/${target.id}`, {
            method: "DELETE",
            authToken: adminToken
        });

        const dbresult = DB.instance().select().from(DB.Tables.users).where(eq(DB.Tables.users.id, target.id)).get();
        expect(dbresult).toBeUndefined();
    });
});

describe("Users search route", async () => {
    let userToken: string;

    beforeAll(async () => {
        userToken = await seedSession(testUser.id);
    });

    test("GET /users/search requires authentication", async () => {
        await makeAPIRequest("/v1/users/search?q=alice", {}, 401);
    });

    test("GET /users/search matches by username", async () => {
        const result = await makeAPIRequest(`/v1/users/search?q=${testUser.username}`, {
            authToken: userToken
        });

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThanOrEqual(1);
        const match = result.find((u: any) => u.id === testUser.id);
        expect(match).toBeDefined();
        expect(match!.username).toBe(testUser.username);
        expect(match).not.toHaveProperty("email");
        expect(match).not.toHaveProperty("role");
    });

    test("GET /users/search returns empty array for no matches", async () => {
        const result = await makeAPIRequest("/v1/users/search?q=zzzzzznonexistent", {
            authToken: userToken
        });

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
    });
});

describe("Global API routes", async () => {
    test("GET /health returns API health payload", async () => {
        const res = await API.getApp().request("/health");
        expect(res.status).toBe(200);

        const body = await res.json() as any;
        expect(body.success).toBe(true);
        expect(body.message).toBe("LeiCraft_MC Status Page API is running");
    });

    test("GET / redirects to the latest docs while docs are enabled", async () => {
        const res = await API.getApp().request("/");
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe("/docs/v1");
    });
});
