CREATE TABLE `company_holidays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`reason` text NOT NULL,
	`year` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_report_projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`daily_report_id` integer NOT NULL,
	`project_id` integer NOT NULL,
	`description` text NOT NULL,
	`tracker_time` integer NOT NULL,
	`is_covered_work` integer,
	`is_extra_work` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`daily_report_id`) REFERENCES `daily_reports`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `daily_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`available_status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inquiries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`alias_name` text NOT NULL,
	`tag` text NOT NULL,
	`status` text NOT NULL,
	`due_date` text,
	`app_status` text,
	`is_favourite` integer DEFAULT false,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `inquiry_feeds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`inquiry_id` integer NOT NULL,
	`commented_by` integer NOT NULL,
	`technology` text,
	`description` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`commented_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
