-- Plan 10 T2: flight_schedules stops being a seed table and becomes a cache. Seed rows
-- that were only APPROXIMATED (route via EK's numbering-block convention, times from hub
-- departure banks - see .superpowers/sdd/2026-08-06-plan5-effortless-entry/task-1-report.md)
-- are actively wrong in some cases (EK372 was seeded as DXB->TPE; ground truth is DXB->BKK)
-- and are purged here rather than kept as silently-confident wrong data. A cache miss after
-- this migration now falls through to the live provider chain (worker/src/schedule-providers)
-- instead of serving a guess.
--
-- Kept set: ONLY the flight numbers whose route AND at least one direction's times were
-- independently confirmed against a live flight-tracking source in that report - NOT the
-- broader "20 rows" the report's summary line claims, which on inspection (its own table +
-- its own Concerns #3) actually includes 5 reverse legs (EK074, EK204, EK319, EK405, EK501)
-- explicitly flagged there as "mirrored/estimated ... same accuracy tier as the fully
-- approximated rows". Those 5 are treated as unverified and purged along with the rest.
-- Verified count reconciles to 13 flight numbers / 17 rows (EK384/385 and EK412/413 are
-- each 2-leg pairs). See task-2-report.md for the full reconciliation.
UPDATE flight_schedules
SET source = 'seed-verified'
WHERE flight_no IN (
  'EK001', 'EK002',
  'EK073',
  'EK203',
  'EK318',
  'EK384', 'EK385',
  'EK404',
  'EK412', 'EK413',
  'EK448', 'EK449',
  'EK500'
);
--> statement-breakpoint
DELETE FROM flight_schedules
WHERE source IS NULL OR source != 'seed-verified';
