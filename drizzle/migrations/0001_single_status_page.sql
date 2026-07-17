-- Migration: collapse multi-status-page support into a single status page.
-- 1. Create new tables for the single status page.
-- 2. Copy data from the configured root status page (or the first available page) into the new tables.
-- 3. Rename old multi-page tables out of the way (safer than DROP TABLE in SQLite).
-- 4. Remove the root_status_page_id setting.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `monitor_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `monitor_group_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`group_id` integer,
	`display_name` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `monitor_groups`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `status_page_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`is_public` integer DEFAULT true NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`theme` text DEFAULT 'auto' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `incidents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'investigating' NOT NULL,
	`severity` text DEFAULT 'major' NOT NULL,
	`is_resolved` integer DEFAULT false NOT NULL,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `maintenance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`scheduled_start_at` integer NOT NULL,
	`scheduled_end_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `status_updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`type` text DEFAULT 'general' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint

-- Migrate data from the existing multi-page schema into the single-page schema.
-- Pick the root status page configured in settings, otherwise fall back to the first page.
INSERT INTO `status_page_config` (`id`, `title`, `description`, `is_public`, `is_enabled`, `theme`, `created_at`, `updated_at`)
SELECT
	1,
	COALESCE((
		SELECT `title` FROM `status_pages`
		WHERE `id` = (
			SELECT CAST(`value` AS INTEGER) FROM `settings` WHERE `key` = 'root_status_page_id' LIMIT 1
		)
	), (
		SELECT `title` FROM `status_pages` ORDER BY `id` LIMIT 1
	), 'LeiCraft_MC Status Page'),
	COALESCE((
		SELECT `description` FROM `status_pages`
		WHERE `id` = (
			SELECT CAST(`value` AS INTEGER) FROM `settings` WHERE `key` = 'root_status_page_id' LIMIT 1
		)
	), (
		SELECT `description` FROM `status_pages` ORDER BY `id` LIMIT 1
	), NULL),
	COALESCE((
		SELECT `is_public` FROM `status_pages`
		WHERE `id` = (
			SELECT CAST(`value` AS INTEGER) FROM `settings` WHERE `key` = 'root_status_page_id' LIMIT 1
		)
	), (
		SELECT `is_public` FROM `status_pages` ORDER BY `id` LIMIT 1
	), 1),
	COALESCE((
		SELECT `is_enabled` FROM `status_pages`
		WHERE `id` = (
			SELECT CAST(`value` AS INTEGER) FROM `settings` WHERE `key` = 'root_status_page_id' LIMIT 1
		)
	), (
		SELECT `is_enabled` FROM `status_pages` ORDER BY `id` LIMIT 1
	), 1),
	COALESCE((
		SELECT `theme` FROM `status_pages`
		WHERE `id` = (
			SELECT CAST(`value` AS INTEGER) FROM `settings` WHERE `key` = 'root_status_page_id' LIMIT 1
		)
	), (
		SELECT `theme` FROM `status_pages` ORDER BY `id` LIMIT 1
	), 'auto'),
	COALESCE((
		SELECT `created_at` FROM `status_pages`
		WHERE `id` = (
			SELECT CAST(`value` AS INTEGER) FROM `settings` WHERE `key` = 'root_status_page_id' LIMIT 1
		)
	), (
		SELECT `created_at` FROM `status_pages` ORDER BY `id` LIMIT 1
	), (unixepoch() * 1000)),
	(unixepoch() * 1000)
WHERE EXISTS (SELECT 1 FROM `status_pages` LIMIT 1);

--> statement-breakpoint
INSERT INTO `monitor_groups` (`id`, `name`, `sort_order`)
SELECT `id`, `name`, `sort_order`
FROM `status_page_groups`
WHERE `status_page_id` = (
	SELECT `id` FROM `status_pages`
	WHERE `id` = COALESCE(
		(SELECT CAST(`value` AS INTEGER) FROM `settings` WHERE `key` = 'root_status_page_id' LIMIT 1),
		(SELECT `id` FROM `status_pages` ORDER BY `id` LIMIT 1)
	)
	LIMIT 1
);
--> statement-breakpoint
INSERT INTO `monitor_group_assignments` (`id`, `monitor_id`, `group_id`, `display_name`, `sort_order`)
SELECT `id`, `monitor_id`, `group_id`, `display_name`, `sort_order`
FROM `status_page_monitor_links`
WHERE `status_page_id` = (
	SELECT `id` FROM `status_pages`
	WHERE `id` = COALESCE(
		(SELECT CAST(`value` AS INTEGER) FROM `settings` WHERE `key` = 'root_status_page_id' LIMIT 1),
		(SELECT `id` FROM `status_pages` ORDER BY `id` LIMIT 1)
	)
	LIMIT 1
);
--> statement-breakpoint
INSERT INTO `incidents` (`id`, `title`, `message`, `status`, `severity`, `is_resolved`, `started_at`, `resolved_at`, `created_at`, `updated_at`)
SELECT `id`, `title`, `message`, `status`, `severity`, `is_resolved`, `started_at`, `resolved_at`, `created_at`, `updated_at`
FROM `status_page_incidents`
WHERE `status_page_id` = (
	SELECT `id` FROM `status_pages`
	WHERE `id` = COALESCE(
		(SELECT CAST(`value` AS INTEGER) FROM `settings` WHERE `key` = 'root_status_page_id' LIMIT 1),
		(SELECT `id` FROM `status_pages` ORDER BY `id` LIMIT 1)
	)
	LIMIT 1
);
--> statement-breakpoint
INSERT INTO `maintenance` (`id`, `title`, `message`, `status`, `scheduled_start_at`, `scheduled_end_at`, `created_at`, `updated_at`)
SELECT `id`, `title`, `message`, `status`, `scheduled_start_at`, `scheduled_end_at`, `created_at`, `updated_at`
FROM `status_page_maintenance`
WHERE `status_page_id` = (
	SELECT `id` FROM `status_pages`
	WHERE `id` = COALESCE(
		(SELECT CAST(`value` AS INTEGER) FROM `settings` WHERE `key` = 'root_status_page_id' LIMIT 1),
		(SELECT `id` FROM `status_pages` ORDER BY `id` LIMIT 1)
	)
	LIMIT 1
);
--> statement-breakpoint
INSERT INTO `status_updates` (`id`, `title`, `message`, `type`, `created_at`, `updated_at`)
SELECT `id`, `title`, `message`, `type`, `created_at`, `updated_at`
FROM `status_page_updates`
WHERE `status_page_id` = (
	SELECT `id` FROM `status_pages`
	WHERE `id` = COALESCE(
		(SELECT CAST(`value` AS INTEGER) FROM `settings` WHERE `key` = 'root_status_page_id' LIMIT 1),
		(SELECT `id` FROM `status_pages` ORDER BY `id` LIMIT 1)
	)
	LIMIT 1
);

--> statement-breakpoint
-- Rename old tables out of the way instead of dropping them. This avoids
-- foreign-key/schema-change issues in SQLite/Drizzle migrations and leaves a
-- backup of the previous multi-page data.
ALTER TABLE `status_page_groups` RENAME TO `_old_status_page_groups`;
--> statement-breakpoint
ALTER TABLE `status_page_monitor_links` RENAME TO `_old_status_page_monitor_links`;
--> statement-breakpoint
ALTER TABLE `status_page_incidents` RENAME TO `_old_status_page_incidents`;
--> statement-breakpoint
ALTER TABLE `status_page_maintenance` RENAME TO `_old_status_page_maintenance`;
--> statement-breakpoint
ALTER TABLE `status_page_updates` RENAME TO `_old_status_page_updates`;
--> statement-breakpoint
ALTER TABLE `status_pages` RENAME TO `_old_status_pages`;
--> statement-breakpoint
DELETE FROM `settings` WHERE `key` = 'root_status_page_id';
