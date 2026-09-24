CREATE TABLE `monitor_daily_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`day` text NOT NULL,
	`up_count` integer DEFAULT 0 NOT NULL,
	`down_count` integer DEFAULT 0 NOT NULL,
	`degraded_count` integer DEFAULT 0 NOT NULL,
	`unknown_count` integer DEFAULT 0 NOT NULL,
	`response_time_count` integer DEFAULT 0 NOT NULL,
	`response_time_sum` integer DEFAULT 0 NOT NULL,
	`response_time_min` integer,
	`response_time_max` integer,
	`latency_bucket_0` integer DEFAULT 0 NOT NULL,
	`latency_bucket_1` integer DEFAULT 0 NOT NULL,
	`latency_bucket_2` integer DEFAULT 0 NOT NULL,
	`latency_bucket_3` integer DEFAULT 0 NOT NULL,
	`latency_bucket_4` integer DEFAULT 0 NOT NULL,
	`latency_bucket_5` integer DEFAULT 0 NOT NULL,
	`latency_bucket_6` integer DEFAULT 0 NOT NULL,
	`latency_bucket_7` integer DEFAULT 0 NOT NULL,
	`latency_bucket_8` integer DEFAULT 0 NOT NULL,
	`latency_bucket_9` integer DEFAULT 0 NOT NULL,
	`latency_bucket_10` integer DEFAULT 0 NOT NULL,
	`latency_bucket_11` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monitor_daily_stats_monitor_day_idx` ON `monitor_daily_stats` (`monitor_id`,`day`);--> statement-breakpoint
CREATE INDEX `monitor_status_checks_monitor_checked_idx` ON `monitor_status_checks` (`monitor_id`,`created_at`);