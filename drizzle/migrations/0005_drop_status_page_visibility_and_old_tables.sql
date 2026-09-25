-- Migration: the single status page is always public and enabled, so its
-- `is_public` and `is_enabled` flags are dropped. Also removes the `_old_*`
-- backups of the multi-page tables that 0001_single_status_page renamed out of
-- the way; their data was copied into the current tables by that migration.
-- Children are dropped before the tables they reference.
-- Note: comments share the first statement's chunk — bun:sqlite cannot run a
-- comment-only chunk between breakpoint markers.
ALTER TABLE `status_page_config` DROP COLUMN `is_public`;--> statement-breakpoint
ALTER TABLE `status_page_config` DROP COLUMN `is_enabled`;--> statement-breakpoint
DROP TABLE IF EXISTS `_old_status_page_monitor_links`;--> statement-breakpoint
DROP TABLE IF EXISTS `_old_status_page_groups`;--> statement-breakpoint
DROP TABLE IF EXISTS `_old_status_page_incidents`;--> statement-breakpoint
DROP TABLE IF EXISTS `_old_status_page_maintenance`;--> statement-breakpoint
DROP TABLE IF EXISTS `_old_status_page_updates`;--> statement-breakpoint
DROP TABLE IF EXISTS `_old_status_pages`;
