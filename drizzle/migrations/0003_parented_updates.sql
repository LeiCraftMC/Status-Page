-- Migration: rework status_updates into parented update entries.
-- Updates are no longer a standalone category — every update belongs to an
-- incident or maintenance entry and carries the parent's status at posting
-- time. Per product decision, existing standalone rows are deleted rather than
-- kept as orphans. The table is rebuilt (create new, drop old, rename) because
-- columns are dropped and rows discarded.
DELETE FROM `status_updates`;
--> statement-breakpoint
CREATE TABLE `status_updates_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_type` text NOT NULL,
	`parent_id` integer NOT NULL,
	`message` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
DROP TABLE `status_updates`;
--> statement-breakpoint
ALTER TABLE `status_updates_new` RENAME TO `status_updates`;