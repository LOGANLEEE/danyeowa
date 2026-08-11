-- Arrival alerts fire three times (60 min out, 30 min out, on landing), so a single timestamp
-- cannot say which of them already went. arrival_alert_stage holds the smallest offset sent.
ALTER TABLE `flights` ADD `arrival_alert_stage` integer;
--> statement-breakpoint
-- Opt out of arrival pings without losing report-time reminders.
ALTER TABLE `notification_prefs` ADD `arrival_enabled` integer DEFAULT 1 NOT NULL;
