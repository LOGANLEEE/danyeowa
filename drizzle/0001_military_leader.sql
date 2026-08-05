CREATE TABLE `airports` (
	`iata` text(3) PRIMARY KEY NOT NULL,
	`city` text NOT NULL,
	`name` text NOT NULL,
	`tz` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flights` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`user_id` text NOT NULL,
	`flight_no` text NOT NULL,
	`origin` text(3) NOT NULL,
	`dest` text(3) NOT NULL,
	`dep_utc` text NOT NULL,
	`arr_utc` text NOT NULL,
	`report_utc` text NOT NULL,
	`dep_tz` text NOT NULL,
	`arr_tz` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`notes` text,
	`leg_seq` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
