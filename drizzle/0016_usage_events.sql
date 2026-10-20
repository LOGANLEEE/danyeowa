-- First-party usage events: how the one consenting crew user moves through adding a roster.
-- Read only by GET /api/usage, which is gated on USAGE_VIEWER_EMAILS. Cascades with the user, so
-- deleting an account still deletes everything it ever did.
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`name` text NOT NULL,
	`props` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `usage_events_user_at_idx` ON `usage_events` (`user_id`,`at`);
