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
  reportNotifiedAt: integer("report_notified_at", { mode: "number" }),
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
   * `learnAirportsForLegs`) - ONLY AeroDataBox ever writes this, since it's the only
   * provider whose response carries a genuine IANA tz name; the fr24 scraper never
   * learns an airport (see ProviderLeg.originAirport doc comment for why). */
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
