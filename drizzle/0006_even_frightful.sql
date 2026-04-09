ALTER TABLE `auth_refresh_sessions` ADD `is_persistent` integer DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE `password_reset_otps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`email` text NOT NULL,
	`otp_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`verified_at` text,
	`consumed_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `password_reset_otps_user_id_idx` ON `password_reset_otps` (`user_id`);
--> statement-breakpoint
CREATE INDEX `password_reset_otps_email_idx` ON `password_reset_otps` (`email`);
--> statement-breakpoint
CREATE INDEX `password_reset_otps_expires_at_idx` ON `password_reset_otps` (`expires_at`);
