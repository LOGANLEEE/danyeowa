CREATE TABLE `flight_schedules` (
	`flight_no` text NOT NULL,
	`leg_seq` integer DEFAULT 0 NOT NULL,
	`origin` text(3) NOT NULL,
	`dest` text(3) NOT NULL,
	`dep_local` text NOT NULL,
	`arr_local` text NOT NULL,
	`day_offset` integer DEFAULT 0 NOT NULL,
	`days_of_week` text NOT NULL,
	`valid_from` text,
	`valid_to` text,
	`confirm_count` integer DEFAULT 0 NOT NULL,
	`last_confirmed_at` integer,
	PRIMARY KEY(`flight_no`, `leg_seq`)
);
