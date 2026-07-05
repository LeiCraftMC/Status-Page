import { Hono } from "hono";
import type { Context } from "hono";
import { AuthModel } from './model'
import { validator as zValidator } from "hono-openapi";
import { DB } from "../../../../../../db";
import { eq } from "drizzle-orm";
import { APIResponse } from "../../../../utils/api-res";
import { AuthHandler, SessionHandler } from "../../../../utils/authHandler";
import { APIResponseSpec, APIRouteSpec } from "../../../../utils/specHelpers";
import { router as resetPasswordRouter } from "./reset-password";
import { DOCS_TAGS } from "../../docs";

// Dummy bcrypt hash for timing-normalized login failures — prevents username enumeration
// Lazy-initialized because top-level await is not available in Nitro's es2019 target
let DUMMY_PASSWORD_HASH: string | null = null;
async function getDummyHash(): Promise<string> {
    if (!DUMMY_PASSWORD_HASH) {
        DUMMY_PASSWORD_HASH = await Bun.password.hash("dummy-timing-constant");
    }
    return DUMMY_PASSWORD_HASH;
}

// In-memory login throttle, scoped per IP + per username.
//
// A purely per-username ("global") counter was removed: because it spanned all IPs and
// was incremented before the password was even checked, anyone who knew a username
// (e.g. the default admin) could lock the real owner out for the whole window with a
// handful of bad passwords — a trivial account-lockout DoS. Per-IP scoping keeps
// brute-force protection, and the counter is only bumped on a *failed* attempt, so a
// correct password under the cap is never rejected.
const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

// Periodic cleanup to prevent unbounded memory growth — runs every 5 minutes
const LOGIN_CLEANUP_INTERVAL = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of loginAttempts) {
        if (entry.resetAt <= now) loginAttempts.delete(key);
    }
}, LOGIN_WINDOW_MS);
// Allow the process to exit without waiting for this interval
LOGIN_CLEANUP_INTERVAL.unref();

function getClientId(c: Context) {
    // Behind a reverse proxy (the Nitro-embedded production path builds a synthetic
    // Request with no remoteAddr), fall back to forwarded headers so per-IP throttling
    // does not collapse into a single shared "unknown" bucket.
    const forwarded = c.req.header("x-forwarded-for");
    if (forwarded) {
        const first = forwarded.split(",")[0]?.trim();
        if (first) return first;
    }
    const realIp = c.req.header("x-real-ip");
    if (realIp) return realIp.trim();
    // @ts-ignore bun/hono provides a native request with connection info
    const remote = (c.req.raw as any)?.remoteAddr?.hostname;
    return remote || "unknown";
}

function getLoginAttemptKey(clientId: string, username: string) {
    return `${clientId}:${username.toLowerCase()}`;
}

function isLoginRateLimited(loginAttemptKey: string): boolean {
    const entry = loginAttempts.get(loginAttemptKey);
    return !!entry && entry.resetAt > Date.now() && entry.count >= LOGIN_MAX_ATTEMPTS;
}

/** Record a *failed* login attempt for this IP+username and return the new count. */
function registerFailedLoginAttempt(loginAttemptKey: string): number {
    const now = Date.now();
    let entry = loginAttempts.get(loginAttemptKey);
    if (!entry || entry.resetAt <= now) {
        entry = { count: 1, resetAt: now + LOGIN_WINDOW_MS };
        loginAttempts.set(loginAttemptKey, entry);
    } else {
        entry.count += 1;
    }
    return entry.count;
}

function clearFailedLoginAttempts(loginAttemptKey: string) {
    loginAttempts.delete(loginAttemptKey);
}

export const router = new Hono().basePath('/auth');

router.post('/login',

    APIRouteSpec.unauthenticated({
        summary: "User Login",
        description: "Authenticate a user with their username and password",
        tags: [DOCS_TAGS.AUTHENTICATION],

        responses: APIResponseSpec.describeWithWrongInputs(
            APIResponseSpec.success("Login successful", AuthModel.Login.Response),
            APIResponseSpec.unauthorized("Invalid username or password / You are already authenticated"),
            APIResponseSpec.tooManyRequests("Too many login attempts. Try again later.")
        ),

    }),

    zValidator("json", AuthModel.Login.Body),
    
    async (c) => {
        //@ts-ignore
        const authContext = c.get("authContext") as AuthHandler.AuthContext;
        if (authContext.type !== 'unauthenticated') {
            return APIResponse.forbidden(c, "You are already authenticated");
        }

        const { username, password } = c.req.valid("json");

        const clientId = getClientId(c);
        const loginAttemptKey = getLoginAttemptKey(clientId, username);

        // Block over-limit clients up front. Only *failed* attempts are counted (below),
        // so a correct password is never rejected while still under the cap.
        if (isLoginRateLimited(loginAttemptKey)) {
            const retrySeconds = Math.max(1, Math.ceil(LOGIN_WINDOW_MS / 1000));
            c.header("Retry-After", retrySeconds.toString());
            return APIResponse.tooManyRequests(c, `Too many login attempts. Try again in ${retrySeconds}s`);
        }

        const user = DB.instance().select().from(DB.Tables.users).where(eq(DB.Tables.users.username, username)).get();
        if (!user) {
            // Timing-normalized: always run a bcrypt call to prevent username enumeration
            await Bun.password.verify("dummy-timing-constant", await getDummyHash());
            registerFailedLoginAttempt(loginAttemptKey);
            return APIResponse.unauthorized(c, "Invalid username or password");
        }

        const passwordMatch = await Bun.password.verify(password, user.password_hash);
        if (!passwordMatch) {
            registerFailedLoginAttempt(loginAttemptKey);
            return APIResponse.unauthorized(c, "Invalid username or password");
        }

        // Successful login — clear the failure counter for this IP+username.
        clearFailedLoginAttempts(loginAttemptKey);

        const session = await SessionHandler.createSession(user.id);

        return APIResponse.success(c, "Login successful", session satisfies AuthModel.Login.Response);
    }
);

router.get('/session',

    APIRouteSpec.authenticated({
        summary: "Get Current Session",
        description: "Retrieve the current user's session information",
        tags: [DOCS_TAGS.AUTHENTICATION],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.success("Session info retrieved successfully", AuthModel.Session.Response),
            APIResponseSpec.unauthorized("Unauthorized: Invalid or missing session token / Your Auth Context is not a session"),
        )

    }),

    async (c) => {
        // @ts-ignore
        const authContext = c.get("authContext") as AuthHandler.AuthContext;
        if (authContext.type !== 'session') {
            return APIResponse.unauthorized(c, "Your Auth Context is not a session");
        }

        return APIResponse.success(c, "Session info retrieved successfully", {
            user_id: authContext.user_id,
            user_role: authContext.user_role,
            created_at: authContext.created_at,
            expires_at: authContext.expires_at
        } satisfies AuthModel.Session.Response);
    }
);

router.post('/logout',

    APIRouteSpec.authenticated({
        summary: "User Logout",
        description: "Invalidate the current user's session",
        tags: [DOCS_TAGS.AUTHENTICATION],

        responses: APIResponseSpec.describeBasic(
            APIResponseSpec.successNoData("Logout successful"),
            APIResponseSpec.unauthorized("Unauthorized: Invalid or missing session token / Your Auth Context is not a session"),
        )

    }),

    async (c) => {
        // @ts-ignore
        const authContext = c.get("authContext") as AuthHandler.AuthContext;

        if (authContext.type !== 'session') {
            return APIResponse.unauthorized(c, "Your Auth Context is not a session");
        }

        await SessionHandler.inValidateSession(authContext.id);

        return APIResponse.successNoData(c, "Logout successful");
    }
);

router.route('/', resetPasswordRouter);
