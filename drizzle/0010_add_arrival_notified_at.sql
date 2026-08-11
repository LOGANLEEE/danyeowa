-- Arrival alerts: "her flight lands in an hour" is a different moment from report time, and a
-- flight can legitimately need both, so it needs its own idempotency stamp.
ALTER TABLE `flights` ADD `arrival_notified_at` integer;
