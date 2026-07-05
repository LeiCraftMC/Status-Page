import { sql } from 'drizzle-orm';

import {
    sqliteTable,
    integer,
    text,
} from 'drizzle-orm/sqlite-core';
import { SQLUtils } from './utils';
import { UserAccountSettings } from '../lib/api/utils/shared-models/accountData';

/**
 * @deprecated Use DB.Tables.users to access this table.
 */
export const users = sqliteTable('users', {
    id: integer().primaryKey({ autoIncrement: true }),

    username: text().notNull().unique(),
    display_name: text().notNull(),
    email: text().notNull().unique(),
    password_hash: text().notNull(),

    role: text({
        enum: UserAccountSettings.Roles
    }).default("member").notNull(),

    created_at: SQLUtils.getCreatedAtColumn(),
});

/**
 * @deprecated Use DB.Tables.passwordResets to access this table.
 */
export const passwordResets = sqliteTable('password_resets', {
    token: text().primaryKey(),
    user_id: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
    created_at: SQLUtils.getCreatedAtColumn(),
    expires_at: integer().notNull()
});

/**
 * @deprecated Use DB.Tables.sessions to access this table.
 */
export const sessions = sqliteTable('sessions', {
    id: text().primaryKey(),
    hashed_token: text().notNull(),
    user_id: integer().notNull().references(() => users.id, { onDelete: 'cascade' }),
    // we cache user role here for easier permission checking without having to join the users table, and we will check the role in users table on every update to make sure it's still valid
    user_role: text({
        enum: UserAccountSettings.Roles
    }).notNull(),
    created_at: SQLUtils.getCreatedAtColumn(),
    expires_at: integer().notNull()
});



/**
 * @deprecated Use DB.Tables.settings to access this table.
 */
export const metadata = sqliteTable('metadata', {
    key: text().primaryKey(),
    data: text({ mode: 'json' }).$type<Record<string, any> | Array<any>>().notNull()
});


/**
 * @deprecated Use DB.Tables.monitors to access this table.
 */
export const monitors = sqliteTable('monitors', {
    id: integer().primaryKey({ autoIncrement: true }),

    name: text().notNull().unique(),
    type: text({ enum: ['http', 'tcp'] as const }).notNull(),
    target: text().notNull(),

    interval_seconds: integer().notNull().default(60),
    timeout_seconds: integer().notNull().default(10),

    // HTTP-specific fields (ignored for tcp monitors)
    http_method: text({ enum: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const }),
    expected_http_status: integer(),
    follow_redirects: integer({ mode: 'boolean' }).notNull().default(true),
    verify_tls: integer({ mode: 'boolean' }).notNull().default(true),

    is_enabled: integer({ mode: 'boolean' }).notNull().default(true),

    created_at: SQLUtils.getCreatedAtColumn(),
});

/**
 * @deprecated Use DB.Tables.monitorStatusChecks to access this table.
 */
export const monitorStatusChecks = sqliteTable('monitor_status_checks', {
    id: integer().primaryKey({ autoIncrement: true }),

    monitor_id: integer().notNull().references(() => monitors.id, { onDelete: 'cascade' }),
    status: text({ enum: ['up', 'down', 'degraded', 'unknown'] as const }).notNull().default('unknown'),
    response_time_ms: integer(),
    checked_at: SQLUtils.getCreatedAtColumn(),
});

/**
 * @deprecated Use DB.Tables.statusPages to access this table.
 */
export const statusPages = sqliteTable('status_pages', {
    id: integer().primaryKey({ autoIncrement: true }),

    slug: text().notNull().unique(),
    title: text().notNull(),
    description: text(),

    is_public: integer({ mode: 'boolean' }).notNull().default(true),
    is_enabled: integer({ mode: 'boolean' }).notNull().default(true),

    theme: text({ enum: ['light', 'dark', 'auto'] as const }).notNull().default('auto'),

    created_at: SQLUtils.getCreatedAtColumn(),
});

/**
 * @deprecated Use DB.Tables.statusPageGroups to access this table.
 */
export const statusPageGroups = sqliteTable('status_page_groups', {
    id: integer().primaryKey({ autoIncrement: true }),

    status_page_id: integer().notNull().references(() => statusPages.id, { onDelete: 'cascade' }),
    name: text().notNull(),
    sort_order: integer().notNull().default(0),
});

/**
 * @deprecated Use DB.Tables.statusPageMonitorLinks to access this table.
 */
export const statusPageMonitorLinks = sqliteTable('status_page_monitor_links', {
    id: integer().primaryKey({ autoIncrement: true }),

    status_page_id: integer().notNull().references(() => statusPages.id, { onDelete: 'cascade' }),
    monitor_id: integer().notNull().references(() => monitors.id, { onDelete: 'cascade' }),
    group_id: integer().references(() => statusPageGroups.id, { onDelete: 'set null' }),

    display_name: text(),
    sort_order: integer().notNull().default(0),
});

/**
 * @deprecated Use DB.Tables.settings to access this table.
 */
export const settings = sqliteTable('settings', {
    key: text().primaryKey(),
    value: text({ mode: 'json' }).$type<any>().notNull(),
});

/**
 * @deprecated Use DB.Tables.statusPageIncidents to access this table.
 */
export const statusPageIncidents = sqliteTable('status_page_incidents', {
    id: integer().primaryKey({ autoIncrement: true }),

    status_page_id: integer().notNull().references(() => statusPages.id, { onDelete: 'cascade' }),

    title: text().notNull(),
    message: text().notNull(),

    status: text({ enum: ['investigating', 'identified', 'monitoring', 'resolved'] as const }).notNull().default('investigating'),
    severity: text({ enum: ['critical', 'major', 'minor', 'maintenance'] as const }).notNull().default('major'),

    is_resolved: integer({ mode: 'boolean' }).notNull().default(false),

    started_at: SQLUtils.getCreatedAtColumn("started_at"),
    resolved_at: integer({ mode: 'number' }),

    created_at: SQLUtils.getCreatedAtColumn(),
    updated_at: SQLUtils.getCreatedAtColumn("updated_at"),
});

/**
 * @deprecated Use DB.Tables.statusPageMaintenance to access this table.
 */
export const statusPageMaintenance = sqliteTable('status_page_maintenance', {
    id: integer().primaryKey({ autoIncrement: true }),

    status_page_id: integer().notNull().references(() => statusPages.id, { onDelete: 'cascade' }),

    title: text().notNull(),
    message: text().notNull(),

    status: text({ enum: ['scheduled', 'in_progress', 'completed', 'cancelled'] as const }).notNull().default('scheduled'),

    scheduled_start_at: integer({ mode: 'number' }).notNull(),
    scheduled_end_at: integer({ mode: 'number' }),

    created_at: SQLUtils.getCreatedAtColumn(),
    updated_at: SQLUtils.getCreatedAtColumn("updated_at"),
});

/**
 * @deprecated Use DB.Tables.statusPageUpdates to access this table.
 */
export const statusPageUpdates = sqliteTable('status_page_updates', {
    id: integer().primaryKey({ autoIncrement: true }),

    status_page_id: integer().notNull().references(() => statusPages.id, { onDelete: 'cascade' }),

    title: text().notNull(),
    message: text().notNull(),

    type: text({ enum: ['general', 'incident', 'maintenance'] as const }).notNull().default('general'),

    created_at: SQLUtils.getCreatedAtColumn(),
    updated_at: SQLUtils.getCreatedAtColumn("updated_at"),
});


