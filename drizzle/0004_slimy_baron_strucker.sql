CREATE TABLE `attendance_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`date` text NOT NULL,
	`time_in` text NOT NULL,
	`time_out` text,
	`location_latitude` real,
	`location_longitude` real,
	`duration` integer,
	`status` text NOT NULL,
	`check_in_method` text NOT NULL,
	`reader_id` text,
	`location` text,
	`tag_uid` text,
	`idempotency_key` text,
	`synced_at` text,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_records_idempotency_key_unique` ON `attendance_records` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` integer,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`correlation_id` text,
	`details` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_logs_actor_user_id_idx` ON `audit_logs` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_resource_idx` ON `audit_logs` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `auth_refresh_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`refresh_token_hash` text NOT NULL,
	`user_agent` text,
	`ip_address` text,
	`expires_at` text NOT NULL,
	`rotated_at` text,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`last_used_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_refresh_sessions_refresh_token_hash_unique` ON `auth_refresh_sessions` (`refresh_token_hash`);--> statement-breakpoint
CREATE INDEX `auth_refresh_sessions_user_id_idx` ON `auth_refresh_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `auth_refresh_sessions_expires_at_idx` ON `auth_refresh_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `business_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`business_name` text NOT NULL,
	`email` text,
	`contact_number` text,
	`address` text,
	`gst_no` text,
	`pan` text,
	`tan` text,
	`registration_no` text,
	`terms_and_conditions` text,
	`notes` text,
	`payment_terms` text,
	`logo_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_categories_name_unique` ON `expense_categories` (`name`);--> statement-breakpoint
CREATE TABLE `nfc_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tag_uid` text NOT NULL,
	`employee_id` integer,
	`status` text NOT NULL,
	`enrolled_at` text NOT NULL,
	`enrolled_by` integer,
	`last_used_at` text,
	`reader_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enrolled_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nfc_tags_tag_uid_unique` ON `nfc_tags` (`tag_uid`);--> statement-breakpoint
CREATE TABLE `payroll` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`month` text NOT NULL,
	`year` integer NOT NULL,
	`base_salary` integer NOT NULL,
	`present_days` integer DEFAULT 0 NOT NULL,
	`absent_days` integer DEFAULT 0 NOT NULL,
	`half_days` integer DEFAULT 0 NOT NULL,
	`leave_days` integer DEFAULT 0 NOT NULL,
	`total_working_days` integer NOT NULL,
	`calculated_salary` integer NOT NULL,
	`deductions` integer DEFAULT 0,
	`bonuses` integer DEFAULT 0,
	`net_salary` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`generated_by` integer NOT NULL,
	`generated_at` text NOT NULL,
	`approved_by` integer,
	`approved_at` text,
	`paid_at` text,
	`notes` text,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`generated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vendor_id` integer NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`description` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`bill_url` text,
	`due_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reader_devices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reader_id` text NOT NULL,
	`name` text NOT NULL,
	`location` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`ip_address` text,
	`last_heartbeat` text,
	`config` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reader_devices_reader_id_unique` ON `reader_devices` (`reader_id`);--> statement-breakpoint
CREATE TABLE `reimbursement_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`max_amount` integer,
	`is_active` integer DEFAULT true,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reimbursement_categories_name_unique` ON `reimbursement_categories` (`name`);--> statement-breakpoint
CREATE TABLE `reimbursements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_id` text NOT NULL,
	`employee_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'INR',
	`expense_date` text NOT NULL,
	`description` text NOT NULL,
	`receipt_url` text,
	`status` text NOT NULL,
	`submitted_at` text,
	`reviewed_by` integer,
	`reviewed_at` text,
	`admin_comments` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `reimbursement_categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reimbursements_request_id_unique` ON `reimbursements` (`request_id`);--> statement-breakpoint
CREATE TABLE `token_blacklist` (
	`id` text PRIMARY KEY NOT NULL,
	`token_id` text NOT NULL,
	`user_id` integer,
	`reason` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `token_blacklist_token_id_unique` ON `token_blacklist` (`token_id`);--> statement-breakpoint
CREATE INDEX `token_blacklist_user_id_idx` ON `token_blacklist` (`user_id`);--> statement-breakpoint
CREATE INDEX `token_blacklist_expires_at_idx` ON `token_blacklist` (`expires_at`);--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`contact_person` text,
	`email` text,
	`phone` text,
	`address` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `employees` ADD `nfc_card_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `employees_nfc_card_id_unique` ON `employees` (`nfc_card_id`);--> statement-breakpoint
ALTER TABLE `invoices` ADD `terms_and_conditions` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `payment_terms` text;--> statement-breakpoint
ALTER TABLE `leave_requests` ADD `leave_period` text DEFAULT 'full_day' NOT NULL;--> statement-breakpoint
ALTER TABLE `leave_requests` ADD `actual_days` real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `tickets` ADD `created_by` integer REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `users` ADD `failed_login_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `locked_until` text;--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);--> statement-breakpoint
CREATE INDEX `users_active_idx` ON `users` (`is_active`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_at_idx` ON `sessions` (`expires_at`);