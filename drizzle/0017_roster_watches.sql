-- Per-person "tell me when their roster changes" opt-in, plus the roster fingerprint last seen.
-- Absent row = off. Cascades with either account, so deleting an account removes every watch
-- that names it.
CREATE TABLE `roster_watches` (
	`watcher_user_id` text NOT NULL,
	`watched_user_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_fingerprint` text,
	PRIMARY KEY(`watcher_user_id`, `watched_user_id`),
	FOREIGN KEY (`watcher_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`watched_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
