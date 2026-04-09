CREATE TABLE `payroll_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_key` text NOT NULL,
	`month` text NOT NULL,
	`year` integer NOT NULL,
	`employee_scope` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by` integer NOT NULL,
	`requested_at` text NOT NULL,
	`started_at` text,
	`completed_at` text,
	`result` text,
	`error` text,
	FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payroll_jobs_job_key_unique` ON `payroll_jobs` (`job_key`);--> statement-breakpoint
CREATE INDEX `payroll_jobs_status_idx` ON `payroll_jobs` (`status`);--> statement-breakpoint
CREATE INDEX `payroll_jobs_month_idx` ON `payroll_jobs` (`month`,`year`);