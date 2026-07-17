import { drizzle as drizzleD1, DrizzleD1Database } from 'drizzle-orm/d1';
import { drizzle as drizzleBunSQLite, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import * as TableSchema from './schema';
import { Logger } from '../utils/logger';
import { ConfigHandler } from '../utils/config';
import { migrate as migrateD1 } from 'drizzle-orm/d1/migrator';
import { migrate as migrateBunSQLite } from 'drizzle-orm/bun-sqlite/migrator';
import { D1Database } from '@cloudflare/workers-types';
import { DrizzleDB } from './utils';
import { Runtime } from '../utils/runtime';

export class DB {

    protected static db: DrizzleDB;
    protected static dbType: "bun-sqlite" | "d1";

    static async init(
        dbConfig: D1Database | string,
        autoMigrate: boolean = false,
        configBaseDir?: string
    ) {

        if (typeof dbConfig === 'string' && Runtime.isBun) {

            await Runtime.FS.ensureDirectoryExists(await Runtime.FS.getPathDirname(dbConfig));

            this.db = drizzleBunSQLite(dbConfig)
            this.dbType = "bun-sqlite";
        } else {
            this.db = drizzleD1(dbConfig)
            this.dbType = "d1";
        }

        if (autoMigrate) {
            Logger.info("Running database migrations...");
            if (this.dbType === "bun-sqlite") {
                await migrateBunSQLite(this.db as DrizzleDB.BunSQLite, { migrationsFolder: "drizzle/migrations" });
            } else {
                await migrateD1(this.db as DrizzleDB.D1, { migrationsFolder: "drizzle/migrations" });
            }
            Logger.info("Database migrations completed.");
        }

        await this.createInitialAdminUserIfNeeded(configBaseDir ?? ".");

        Logger.info(`Database initialized`);
    }

    static async createInitialAdminUserIfNeeded(configBaseDir: string) {
        const usersTableEmpty = (await this.db.select().from(DB.Tables.users).limit(1)).length === 0;
        if (!usersTableEmpty) return;

        const username = "admin";

        const createdAdmin = await this.db.insert(DB.Tables.users).values({
            username,
            email: "admin@app.local",
            password_hash: await Runtime.Password.hashPassword(Runtime.Crypto.randomBytesHex(32)),
            display_name: "Default Administrator",
            role: "admin"
        }).returning().get();

        const admin_user_id = createdAdmin.id;

        const passwordResetToken = Runtime.Crypto.randomBytesHex(64);
        await this.db.insert(DB.Tables.passwordResets).values({
            token: await Runtime.Crypto.sha256(passwordResetToken),
            user_id: admin_user_id,
            expires_at: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 Days
        });

        const APP_URL = ConfigHandler.getConfig()?.LCCFWSP_APP_URL || "https://{APP_URL}";

        if (Runtime.isBun) {

            await Runtime.FS.ensureDirectoryExists(configBaseDir);
            await Runtime.FS.writeFile(`${configBaseDir}/initial_admin_password_reset_token.txt`, `${APP_URL}/auth/reset-password?token=${passwordResetToken}`, {
                mode: 0o600,
            });

            Logger.info(
                `Initial admin user created with username: ${username}.\n` +
                `You can set the password under ${APP_URL}/auth/reset-password?token=${passwordResetToken}\n` +
                `The url is also saved at ${configBaseDir}/initial_admin_password_reset_token.txt\n`
            );

        } else {
            Logger.info(
                `Initial admin user created with username: ${username}.\n` +
                `You can set the password under ${APP_URL}/auth/reset-password?token=${passwordResetToken}\n`
            );
        }
    }

    static instance() {
        if (!this.db) {
            throw new Error('Database not initialized. Call DB.init() first.');
        }
        return DB.db;
    }

    static async close() {
        if (!this.db) return;

        Logger.info("Database connection closed.");
        if (this.dbType === "bun-sqlite") {
            (this.db as DrizzleDB.BunSQLite).$client.close();
        }
        await Runtime.Timers.sleep(500);
    }

}


export namespace DB.Tables {
    export const users = TableSchema.users;
    export const sessions = TableSchema.sessions;
    export const passwordResets = TableSchema.passwordResets;
    export const apiKeys = TableSchema.apiKeys;

    export const settings = TableSchema.settings;
    export const metadata = TableSchema.metadata;

    export const monitors = TableSchema.monitors;
    export const monitorStatusChecks = TableSchema.monitorStatusChecks;

    export const monitorGroups = TableSchema.monitorGroups;
    export const monitorGroupAssignments = TableSchema.monitorGroupAssignments;

    export const statusPageConfig = TableSchema.statusPageConfig;

    export const incidents = TableSchema.incidents;
    export const maintenance = TableSchema.maintenance;
    export const statusUpdates = TableSchema.statusUpdates;

}

export namespace DB.Models {
    export type User = typeof DB.Tables.users.$inferSelect;
    export type Session = typeof DB.Tables.sessions.$inferSelect;
    export type PasswordReset = typeof DB.Tables.passwordResets.$inferSelect;
    export type ApiKey = typeof DB.Tables.apiKeys.$inferSelect;

    export type Setting = typeof DB.Tables.settings.$inferSelect;
    export type Metadata = typeof DB.Tables.metadata.$inferSelect;

    export type Monitor = typeof DB.Tables.monitors.$inferSelect;
    export type MonitorStatusCheck = typeof DB.Tables.monitorStatusChecks.$inferSelect;

    export type MonitorGroup = typeof DB.Tables.monitorGroups.$inferSelect;
    export type MonitorGroupAssignment = typeof DB.Tables.monitorGroupAssignments.$inferSelect;

    export type StatusPageConfig = typeof DB.Tables.statusPageConfig.$inferSelect;

    export type Incident = typeof DB.Tables.incidents.$inferSelect;
    export type Maintenance = typeof DB.Tables.maintenance.$inferSelect;
    export type StatusUpdate = typeof DB.Tables.statusUpdates.$inferSelect;
}
