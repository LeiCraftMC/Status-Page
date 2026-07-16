import { beforeAll, describe, expect, test } from "bun:test";
import { API } from "../server/lib/api";
import { DB } from "../server/db";
import { AuthHandler, AuthUtils, SessionHandler } from "../server/lib/api/utils/authHandler";
import { eq } from "drizzle-orm";
import { makeAPIRequest } from "./helpers/api";
import { seedUser, seedSession, type SeededUser } from "./helpers/seed";
import { AccountModel } from "../server/lib/api/versions/v1/routes/account/model";
import { UsersModel } from "../server/lib/api/versions/v1/routes/admin/users/model";
import { AuthModel } from "../server/lib/api/versions/v1/routes/auth/model";
import { Runtime } from "../server/utils/runtime";
import { hashResetToken } from "../server/lib/api/versions/v1/routes/auth/reset-password";

let testUser: SeededUser;
let testAdmin: SeededUser;

beforeAll(async () => {
    testUser = await seedUser("member", { username: "testuser" }, "UserP@ss1");
    testAdmin = await seedUser("admin", { username: "testadmin" }, "AdminP@ss1");
});

describe("Auth routes and access checks", async () => {

    let session_token: string;

    test("POST /v1/auth/login authenticates and creates session", async () => {

        const data = await makeAPIRequest("/v1/auth/login", {
            method: "POST",
            body: { username: testUser.username, password: testUser.password },
            expectedBodySchema: AuthModel.Login.Response
        });

        expect(data.token.startsWith("lccfwsp_sess_")).toBe(true);
        
        session_token = data.token;

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

    test("POST /v1/auth/login with invalid credentials fails", async () => {

        await makeAPIRequest("/v1/auth/login", {
            method: "POST",
            body: { username: testUser.username, password: "WrongPassword" },
        }, 401);

    });

    test("GET /v1/auth/session returns current session info", async () => {

        const data = await makeAPIRequest("/v1/auth/session", {
            authToken: session_token,
            expectedBodySchema: AuthModel.Session.Response
        });

        expect(data.user_id).toBe(testUser.id);
        expect(data.user_role).toBe("member");
    });

    test("GET /v1/auth/session with invalid token fails", async () => {

        await makeAPIRequest("/v1/auth/session", {
            authToken: "invalid_token",
        }, 401);

    });

    test("POST /v1/auth/logout invalidates session", async () => {

        await makeAPIRequest("/v1/auth/logout", {
            method: "POST",
            authToken: session_token
        });

        const session = await AuthHandler.getAuthContext(session_token);

        expect(session).toBeNil();
    });
});

describe("Auth reset-password routes", async () => {

    let resetUser: SeededUser;
    let resetSessionToken: string;

    beforeAll(async () => {
        resetUser = await seedUser("member");
        resetSessionToken = await seedSession(resetUser.id).then(s => s.token);
    });

    test("POST /v1/auth/reset-password with invalid token fails", async () => {
        await makeAPIRequest("/v1/auth/reset-password", {
            method: "POST",
            body: {
                reset_token: "invalid-token",
                new_password: "ResetP@ssw0rd1"
            }
        }, 400);
    });

    test("POST /v1/auth/reset-password updates credentials for a valid reset token", async () => {
        const validResetToken = `reset_${Runtime.Crypto.randomUUID().replace(/-/g, "")}`;
        const nextPassword = "ResetP@ssw0rd1";
        const wrongLoginIP = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
        const correctLoginIP = `203.0.114.${Math.floor(Math.random() * 200) + 1}`;

        await DB.instance().insert(DB.Tables.passwordResets).values({
            token: await hashResetToken(validResetToken),
            user_id: resetUser.id,
            expires_at: Date.now() + 10 * 60 * 1000
        }).run();

        await makeAPIRequest("/v1/auth/reset-password", {
            method: "POST",
            body: {
                reset_token: validResetToken,
                new_password: nextPassword
            }
        }, 200);

        await makeAPIRequest("/v1/auth/session", {
            authToken: resetSessionToken
        }, 401);

        await makeAPIRequest("/v1/auth/login", {
            method: "POST",
            body: {
                username: resetUser.username,
                password: resetUser.password
            },
            additionalOptions: {
                headers: {
                    "x-forwarded-for": wrongLoginIP
                }
            }
        }, 401);

        const login = await makeAPIRequest("/v1/auth/login", {
            method: "POST",
            body: {
                username: resetUser.username,
                password: nextPassword
            },
            additionalOptions: {
                headers: {
                    "x-forwarded-for": correctLoginIP
                }
            },
            expectedBodySchema: AuthModel.Login.Response
        }, 200);

        expect(login.token.startsWith("lccfwsp_sess_")).toBe(true);
        resetUser.password = nextPassword;
    });
});

describe("Account routes", async () => {

    let session_token: string;
    
    beforeAll(async () => {
        session_token = await seedSession(testUser.id).then(s => s.token);
    });

    test("GET /v1/account returns current user", async () => {

        const data = await makeAPIRequest("/v1/account", {
            authToken: session_token,
            expectedBodySchema: AccountModel.GetInfo.Response
        });

        expect(data.id).toBe(testUser.id);
        expect(data.username).toBe(testUser.username);
        expect(data.display_name).toBe(testUser.display_name);
        expect(data.email).toBe(testUser.email);
        expect(data.role).toBe("member");
    });

    test("PUT /v1/account updates profile fields", async () => {
        
        const newUserData = {
            display_name: "Updated Name",
            username: "updatedusername",
            email: "updated@example.com",
            current_password: testUser.password
        }

        await makeAPIRequest("/v1/account", {
            method: "PUT",
            authToken: session_token,
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

    test("PUT /v1/account try updating role fails", async () => {
        
        await makeAPIRequest("/v1/account", {
            method: "PUT",
            authToken: session_token,
            body: { role: "admin" }
        }, 400);
        
        const dbresult = DB.instance().select().from(DB.Tables.users).where(eq(DB.Tables.users.id, testUser.id)).get();
        expect(dbresult?.role).toBe("member");
    });

    test("PUT /v1/account/password rotates credentials and invalidates old sessions", async () => {

        const oldPassword = testUser.password;
        const newPassword = "NewP@ssw0rd1";

        await makeAPIRequest("/v1/account/password", {
            method: "PUT",
            authToken: session_token,
            body: {
                current_password: oldPassword,
                new_password: newPassword
            }
        });

        testUser.password = newPassword;

        // Old session should be invalidated
        await makeAPIRequest("/v1/account", {
            authToken: session_token,
        }, 401);

        // Login with old password should fail
        await makeAPIRequest("/v1/auth/login", {
            method: "POST",
            body: { username: testUser.username, password: oldPassword }
        }, 401);

        // Login with new password should succeed
        const data = await makeAPIRequest("/v1/auth/login", {
            method: "POST",
            body: { username: testUser.username, password: newPassword },
            expectedBodySchema: AuthModel.Login.Response
        });

        expect(data.token.startsWith("lccfwsp_sess_")).toBe(true);

        session_token = data.token;
    });

    // test("DELETE /v1/account fails because of existing mail accounts", async () => {
        
    //     // Seed a mail account
    //     const mailAccountID = (await seedMailAccount(testUser.id)).id;

    //     await makeAPIRequest("/v1/account", {
    //         method: "DELETE",
    //         authToken: session_token
    //     }, 400);

    //     await DB.instance().delete(DB.Tables.mailAccounts).where(
    //         eq(DB.Tables.mailAccounts.id, mailAccountID)
    //     ).run();
    // });

    test("DELETE /v1/account removes user data", async () => {
        
        await makeAPIRequest("/v1/account", {
            method: "DELETE",
            authToken: session_token
        });

        const dbresult = DB.instance().select().from(DB.Tables.users).where(eq(DB.Tables.users.id, testUser.id)).get();
        expect(dbresult).toBeUndefined();

        // recreate test user for further tests
        testUser = await seedUser("member", { username: "testuser" }, "UserP@ss1");
    });
});


describe("Admin users routes", async () => {
    let adminToken: string;
    let userToken: string;

    beforeAll(async () => {
        adminToken = await seedSession(testAdmin.id).then(s => s.token);
        userToken = await seedSession(testUser.id).then(s => s.token);
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
        const username = `created_${Runtime.Crypto.randomUUID().slice(0, 8)}`;
        const created = await makeAPIRequest("/v1/admin/users", {
            method: "POST",
            authToken: adminToken,
            body: {
                username,
                display_name: "Created User",
                email: `${Runtime.Crypto.randomUUID()}@example.com`,
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

        const dbresult = await DB.instance().select().from(DB.Tables.users).where(eq(DB.Tables.users.id, target.id)).get();
        expect(dbresult).toBeUndefined();
    });
});

describe("Users search route", async () => {
    let userToken: string;

    beforeAll(async () => {
        userToken = await seedSession(testUser.id).then(s => s.token);
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
