import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const flightSchedules = sqliteTable(
  "flight_schedules",
  {
    flightNo: text("flight_no").notNull(),
    legSeq: integer("leg_seq").notNull().default(0),
    origin: text("origin", { length: 3 }).notNull(),
    dest: text("dest", { length: 3 }).notNull(),
    depLocal: text("dep_local").notNull(),
    arrLocal: text("arr_local").notNull(),
    dayOffset: integer("day_offset").notNull().default(0),
    daysOfWeek: text("days_of_week").notNull(),
    validFrom: text("valid_from"),
    validTo: text("valid_to"),
    confirmCount: integer("confirm_count").notNull().default(0),
    lastConfirmedAt: integer("last_confirmed_at", { mode: "number" }),
    /** Provenance of this row's data. 'seed-verified' = live-source-verified at seed time
     * (Plan 5 T1); 'live-scrape' / 'live-api' = written by a cache-miss provider fetch
     * (Plan 10 T2); 'crowd' = written/upgraded by a user confirm (POST /schedule/confirm).
     * Nullable only for legacy rows pre-dating this column; the Plan 10 purge migration
     * either assigns a source to every surviving row or deletes it, so post-purge this is
     * effectively always set. */
    /** 'local-fetch' = harvested by scripts/fetch-schedules.mjs and posted to /api/ingest.
     * It was already in production before it was in this enum, because the harvester wrote raw
     * SQL and nothing type-checked the value — which is exactly why that write path is gone. */
    source: text("source", {
      enum: ["live-scrape", "live-api", "seed-verified", "crowd", "local-fetch"],
    }),
    /** Epoch ms when this row's data was fetched/written by its `source`. Used to decide
     * staleness (>90d && confirm_count=0 -> background refresh on next hit). */
    fetchedAt: integer("fetched_at", { mode: "number" }),
    /** The calendar date (YYYY-MM-DD) the provider's data actually describes, when known
     * (e.g. the fr24 scraper only observes the page's nearest-to-now operating date, not
     * the specific date a caller asked for). Null when the row isn't date-anchored (seed
     * rows, crowd confirms, or a provider that can't tell us which date it described) -
     * this stops the cache from presenting a nearest-date scrape as if it were verified
     * for the exact date the caller requested. */
    sourceDateIso: text("source_date_iso"),
  },
  (table) => [primaryKey({ columns: [table.flightNo, table.legSeq] })]
);

/** Negative cache for GET /schedule/lookup: a flight number every provider in the chain
 * returned null for. Checked BEFORE the provider chain runs, so a junk/typo'd flight number
 * (e.g. repeated attempts while typing) 404s immediately from this table instead of paying a
 * fresh scrape/API round-trip on every request. Entries expire after
 * `MISS_CACHE_TTL_MS` (schedule.ts) - a flight that's genuinely added to a provider's data
 * later isn't permanently shadowed by an old miss. */
export const scheduleLookupMisses = sqliteTable("schedule_lookup_misses", {
  flightNo: text("flight_no").primaryKey(),
  missedAt: integer("missed_at", { mode: "number" }).notNull(),
});
