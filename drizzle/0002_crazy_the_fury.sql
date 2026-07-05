ALTER TABLE `status_page_incidents` ADD `started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL;--> statement-breakpoint
ALTER TABLE `status_page_incidents` ADD `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL;--> statement-breakpoint
ALTER TABLE `status_page_maintenance` ADD `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL;--> statement-breakpoint
ALTER TABLE `status_page_updates` ADD `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL;