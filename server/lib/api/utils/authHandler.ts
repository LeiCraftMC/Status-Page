import { eq } from "drizzle-orm";
import { DB } from "../../../db";
import { randomBytes as crypto_randomBytes } from 'crypto';
import type { UserAccountSettings } from "./shared-models/accountData";

export class AuthUtils {

    static async getUserRole(userID: number) {
        const user = DB.instance().select().from(DB.Tables.users).where(eq(DB.Tables.users.id, userID)).get();
        if (!user) {
            return null;
        }
        return user.role;
    }

    static createRandomTokenID() {
        return crypto_randomBytes(32).toString('hex');
    }

    static createBaseToken() {
        return crypto_randomBytes(32).toString('hex');
    }

    static getFullToken(prefix: AuthHandler.TOKEN_PREFIX, tokenID: string, tokenBase: string) {
        return `${prefix}${tokenID}:${tokenBase}`;
    }

    static getTokenParts(fullToken: string) {

        const parts = fullToken.split(':') as [string, string];

        if (parts.length !== 2) {
            return null;
        }

        if (parts[0].startsWith(SessionHandler.SESSION_TOKEN_PREFIX)) {

            return {
                prefix: SessionHandler.SESSION_TOKEN_PREFIX,
                id: parts[0].substring(SessionHandler.SESSION_TOKEN_PREFIX.length),
                base: parts[1]
            } satisfies AuthHandler.TokenParts;

        } else {
            return null;
        }
    }

    static hashTokenBase(tokenBase: string) {
        return Bun.password.hash(tokenBase);
    }

    static verifyHashedTokenBase(tokenBase: string, hashedToken: string) {
        return Bun.password.verify(tokenBase, hashedToken);
    }

}

export class SessionHandler {

    static readonly SESSION_TOKEN_PREFIX = "mc_sess_";

    static async createSession(userID: number) {

        const tokenID = AuthUtils.createRandomTokenID();
        const tokenBase = AuthUtils.createBaseToken();

        const fullToken = AuthUtils.getFullToken(
            this.SESSION_TOKEN_PREFIX,
            tokenID,
            tokenBase
        );

        const result = await DB.instance().insert(DB.Tables.sessions).values({
            id: tokenID,
            hashed_token: await AuthUtils.hashTokenBase(tokenBase),
            user_id: userID,
            user_role: await AuthUtils.getUserRole(userID) || 'user',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).getTime() // 7 days from now
        }).returning().get();

        return {
            token: fullToken,
            user_id: result.user_id,
            user_role: result.user_role,
            created_at: result.created_at,
            expires_at: result.expires_at
        } satisfies Omit<DB.Models.Session, 'id' | 'hashed_token'> & { token: string; };
    }

    static async getSession(tokenParts: AuthHandler.TokenParts) {

        if (!tokenParts.prefix.startsWith(this.SESSION_TOKEN_PREFIX)) {
            return null;
        }

        const session = DB.instance().select().from(DB.Tables.sessions).where(
            eq(DB.Tables.sessions.id, tokenParts.id)
        ).get();
        if (!session) {
            return null;
        }

        if (!(await AuthUtils.verifyHashedTokenBase(tokenParts.base, session.hashed_token))) {
            return null;
        }

        return session;
    }

    static async isValidSession(session: DB.Models.Session) {
        if (!session) {
            return false;
        }

        if (session.expires_at < Date.now()) {
            // Delete expired session
            await DB.instance().delete(DB.Tables.sessions).where(eq(DB.Tables.sessions.id, session.id));

            return false;
        }

        return true;
    }

    static async inValidateAllSessionsForUser(userID: number) {
        await DB.instance().delete(DB.Tables.sessions).where(eq(DB.Tables.sessions.user_id, userID));
    }

    static async inValidateSession(tokenID: string) {
        await DB.instance().delete(DB.Tables.sessions).where(eq(DB.Tables.sessions.id, tokenID));
    }

    static async changeUserRoleInSessions(userID: number, newRole: UserAccountSettings.Role) {
        await DB.instance().update(DB.Tables.sessions).set({
            user_role: newRole
        }).where(
            eq(DB.Tables.sessions.user_id, userID)
        )
    }

}

export class AuthHandler {

    static async getTokenType(token: string) {
        if (token.startsWith(SessionHandler.SESSION_TOKEN_PREFIX)) {
            return 'session';
        } else {
            return 'unknown';
        }
    }

    static async getAuthContext(fullToken: string): Promise<AuthHandler.AuthenticatedAuthContext | null> {

        const tokenParts = AuthUtils.getTokenParts(fullToken);
        if (!tokenParts) {
            return null;
        }

        switch (await this.getTokenType(fullToken)) {
            case 'session':

                const session = await SessionHandler.getSession(tokenParts);
                if (!session) {
                    return null;
                }
                return {
                    type: 'session' as const,
                    ...session
                }
            default:
                return null;
        }

    }

    static async isValidAuthContext(authContext: AuthHandler.AuthenticatedAuthContext): Promise<boolean> {
        switch (authContext.type) {
            case 'session':
                return await SessionHandler.isValidSession(authContext);
            default:
                return false;
        }
    }

    static async invalidateAuthContext(authContext: AuthHandler.AuthenticatedAuthContext): Promise<void> {
        switch (authContext.type) {
            case 'session':
                await SessionHandler.inValidateSession(authContext.id);
                break;
        }
    }

    static async invalidateAllAuthContextsForUser(userID: number): Promise<void> {
        await SessionHandler.inValidateAllSessionsForUser(userID);
    }

    static async changeUserRoleInAuthContexts(userID: number, newRole: UserAccountSettings.Role): Promise<void> {
        await SessionHandler.changeUserRoleInSessions(userID, newRole);
    }

}

export namespace AuthHandler {

    export type TOKEN_PREFIX = typeof SessionHandler.SESSION_TOKEN_PREFIX;

    export type AuthenticatedAuthContext = SessionAuthContext;
    export type AuthContext = AuthenticatedAuthContext | UnauthenticatedAuthContext;

    export interface SessionAuthContext extends DB.Models.Session {
        readonly type: 'session';
    }

    export interface UnauthenticatedAuthContext {
        readonly type: 'unauthenticated';
    }

    export interface TokenParts {
        readonly prefix: TOKEN_PREFIX;
        readonly id: string;
        readonly base: string;
    }

}
