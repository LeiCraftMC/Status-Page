CREATE TABLE `status_page_incidents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status_page_id` integer NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'investigating' NOT NULL,
	`severity` text DEFAULT 'major' NOT NULL,
	`is_resolved` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`status_page_id`) REFERENCES `status_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `status_page_maintenance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status_page_id` integer NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`scheduled_start_at` integer NOT NULL,
	`scheduled_end_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`status_page_id`) REFERENCES `status_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `status_page_updates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status_page_id` integer NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`type` text DEFAULT 'general' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`status_page_id`) REFERENCES `status_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
