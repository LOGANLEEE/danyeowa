import { relations } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

export const trips = sqliteTable("trips", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  label: text("label"),
  createdAt: integer("created_at", { mode: "number" })
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const flights = sqliteTable("flights", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  tripId: text("trip_id")
    .notNull()
    .references(() => trips.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  flightNo: text("flight_no").notNull(),
  origin: text("origin", { length: 3 }).notNull(),
  dest: text("dest", { length: 3 }).notNull(),
  depUtc: text("dep_utc").notNull(),
  arrUtc: text("arr_utc").notNull(),
  reportUtc: text("report_utc").notNull(),
  depTz: text("dep_tz").notNull(),
  arrTz: text("arr_tz").notNull(),
  source: text("source").notNull().default("manual"),
  notes: text("notes"),
  legSeq: integer("leg_seq").notNull().default(0),
  /** Does the crew member actually work this sector? A multi-sector flight number is one
   * aircraft routing, not one crew duty — EK205 is DXB->MXP->JFK and the crew can change at
   * Milan. False marks the aircraft's onward routing: kept so the routing stays true, excluded
   * from every derived time (landing, report, day marks, arrival alerts). */
  operating: integer("operating", { mode: "boolean" }).notNull().default(true),
  reportNotifiedAt: integer("report_notified_at", { mode: "number" }),
  // Separate from reportNotifiedAt because the two alerts fire at different moments of the same
  // flight: report time is for the person working it, arrival is for whoever is meeting it.
  arrivalNotifiedAt: integer("arrival_notified_at", { mode: "number" }),
  // Arrival fires more than once (60 min out, 30 min out, on landing), so a single timestamp
  // can't say WHICH ones already went. This holds the smallest offset sent so far; a stage only
  // fires when it is smaller than what is recorded.
  arrivalAlertStage: integer("arrival_alert_stage", { mode: "number" }),
});

export const airports = sqliteTable("airports", {
  iata: text("iata", { length: 3 }).primaryKey(),
  city: text("city").notNull(),
  name: text("name").notNull(),
  tz: text("tz").notNull(),
  /** Provenance of this row. Nullable: every row seeded before Plan 10 T2-fix has no
   * source (the original 108-airport seed, scripts/airports-ek.json, predates this
   * column and is never re-migrated to backfill it - "seeded, no marker" is itself
   * meaningful and left alone). 'live-api' = self-warmed from a live provider's response
   * when a resolved flight touched an IATA outside the seed (see schedule.ts
   * `learnAirportsForLegs`). Written by AeroDataBox, and since 2026-08-12 also by the local
   * harvester: the fr24 JSON API carries a genuine IANA tz name where the old HTML scraper
   * did not, which was the only reason that path never learned an airport. */
  source: text("source", { enum: ["live-api"] }),
});

export const tripsRelations = relations(trips, ({ many }) => ({
  flights: many(flights),
}));

export const flightsRelations = relations(flights, ({ one }) => ({
  trip: one(trips, {
    fields: [flights.tripId],
    references: [trips.id],
  }),
}));
