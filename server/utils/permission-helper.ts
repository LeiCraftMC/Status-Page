import { and, eq } from "drizzle-orm";
import type { DB } from "../db";
import type { AuthHandler } from "../lib/api/utils/authHandler";

export class PermissionHelper {

    private static _dbModule: typeof DB | null = null;

    private static get DB() {
        if (!this._dbModule) {
            throw new Error("PermissionHelper DB module not initialized. Call PermissionHelper.init() before using any methods.");
        }
        return this._dbModule;
    }

    static async init() {

        if (!this._dbModule) {
            this._dbModule = await import("../db").then(module => module.DB);
        }
    }


    /**
     * Simple utility to compare two roles. Returns:
     *   -1 if a < b (a is lower role than b)
     *    0 if a == b
     *    1 if a > b (a is higher role than b)
     * Note: null is treated as "no role" and is lower than any actual role.
     */
    static compareRoles(
        a: PermissionHelper.Roles | null,
        b: PermissionHelper.Roles | null
    ): -1 | 0 | 1 {
        const ai = a === null ? -1 : PermissionHelper.RolePrecedence.indexOf(a);
        const bi = b === null ? -1 : PermissionHelper.RolePrecedence.indexOf(b);
        // Lower index = higher role
        if (ai === bi) return 0;
        // A is higher if its index is smaller (but -1 means "none" and is lowest)
        const aRank = ai === -1 ? -1 : PermissionHelper.RolePrecedence.length - ai;
        const bRank = bi === -1 ? -1 : PermissionHelper.RolePrecedence.length - bi;
        if (aRank > bRank) return 1;
        if (aRank < bRank) return -1;
        return 0;
    }

    /**
     * Return the highest of two roles (ordered ADMIN > MAINTAINER > DEVELOPER > VIEWER).
     */
    static maxRole(
        a: PermissionHelper.Roles | null,
        b: PermissionHelper.Roles | null
    ): PermissionHelper.Roles | null {
        if (a === null) return b;
        if (b === null) return a;
        return this.compareRoles(a, b) >= 0 ? a : b;
    }

    /**
     * Whether the given user owns the publisher (i.e. publishers.owner_user_id === userId).
     */
    static async isInstanceOwner(params: { userId: number; }): Promise<boolean> {

        if (typeof params.publisher === 'object' && 'owner_user_id' in params.publisher) {
            return params.publisher.owner_user_id === params.userId;
        }
        if (!params.publisherId) {
            throw new Error("Either publisherId or publisher object must be provided");
        }

        const row = await this.DB.instance()
            .select({ owner_user_id: this.DB.Tables.publishers.owner_user_id })
            .from(this.DB.Tables.publishers)
            .where(eq(this.DB.Tables.publishers.id, params.publisherId))
            .get();

        if (!row) {
            console.warn(`isPublisherOwner: publisher with id ${params.publisherId} not found`);
            return false;
        }
        
        return row.owner_user_id === params.userId;
    }

    /**
     * Resolve the effective role for a user against a publisher (and optionally a
     * specific package). Returns the highest of:
     *   - publisherMembers.role for (userId, publisherId)
     *   - roleAssignments.role for (userId, packageId) when packageId is given
     * Publisher ownership and site-admin bypass are NOT applied here; callers
     * that need those shortcuts should use `can`.
     */
    static async getEffectiveRole(params: {
        userId: number;
    }): Promise<PermissionHelper.Roles | null> {
        const { userId } = params;

        const membership = await this.DB.instance()
            .select({ role: this.DB.Tables.publisherMembers.role })
            .from(this.DB.Tables.publisherMembers)
            .where(and(
                eq(this.DB.Tables.publisherMembers.user_id, userId),
                eq(this.DB.Tables.publisherMembers.publisher_id, publisherId)
            ))
            .get();

        let role: PermissionHelper.Roles | null = membership?.role ?? null;

        if (packageId !== undefined) {
            const assignment = await this.DB.instance()
                .select({ role: this.DB.Tables.roleAssignments.role })
                .from(this.DB.Tables.roleAssignments)
                .where(and(
                    eq(this.DB.Tables.roleAssignments.user_id, userId),
                    eq(this.DB.Tables.roleAssignments.package_id, packageId)
                ))
                .get();

            role = this.maxRole(role, assignment?.role ?? null);
        }

        return role;
    }

    /**
     * Effective permission bag for a user in a publisher/package scope.
     * Returns `null` if the user has no role at all in that scope.
     */
    static async getEffectivePermissions(params: {
        userId: number;
    }): Promise<PermissionHelper.Permissions | null> {
        const role = await this.getEffectiveRole(params);
        if (role === null) return null;
        return PermissionHelper.RolePermissions[role];
    }


    static async can(params: {
        authContext: AuthHandler.AuthContext;
        check: (perms: PermissionHelper.Permissions, role: PermissionHelper.Roles) => boolean;
    }): Promise<boolean> {

        const { authContext, check: permission } = params;

        if (authContext.type === 'unauthenticated') return false;

        if (await this.isInstanceOwner({ userId: authContext.user_id })) {
            return true;
        }

        const role = await this.getEffectiveRole({
            userId: authContext.user_id
        });
        if (!role) return false;
        const perms = PermissionHelper.RolePermissions[role];

        return !!permission(perms, role);
    }

}

export namespace PermissionHelper {

    export enum Roles {
        ADMIN = "ADMIN",
        MEMBER = "MEMBER"
    }

    export const RolesAsTuple = [Roles.ADMIN, Roles.MEMBER] as const;

    /** Highest → lowest precedence. Used by compareRoles/maxRole. */
    export const RolePrecedence = [
        Roles.ADMIN,
        Roles.MEMBER
    ] as const;

    export interface Permissions {

        monitors: {
            create: boolean;
            update: boolean;
            delete: boolean;
        }

        status_page: {
            update: boolean;
        }

        incidents: {
            create: boolean;
            update: boolean;
            delete: boolean;
        }

        scheduled_events: {
            create: boolean;
            update: boolean;
            delete: boolean;
        }

        members: {
            invite: boolean;
            remove: boolean;
            update: boolean;
        }

    }

    export const RolePermissions = {

        [Roles.ADMIN]: {
            monitors: {
                create: true,
                update: true,
                delete: false
            },
            status_page: {
                update: true
            },
            incidents: {
                create: true,
                update: true,
                delete: true
            },
            scheduled_events: {
                create: true,
                update: true,
                delete: true
            },
            members: {
                invite: true,
                remove: true,
                update: true
            }
        },

        [Roles.MEMBER]: {
            monitors: {
                create: false,
                update: false,
                delete: false
            },
            status_page: {
                update: false
            },
            incidents: {
                create: false,
                update: false,
                delete: false
            },
            scheduled_events: {
                create: false,
                update: false,
                delete: false
            },
            members: {
                invite: false,
                remove: false,
                update: false
            }
        }
    } as const satisfies Record<Roles, Permissions>;

}
