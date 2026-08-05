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
});

export const airports = sqliteTable("airports", {
  iata: text("iata", { length: 3 }).primaryKey(),
  city: text("city").notNull(),
  name: text("name").notNull(),
  tz: text("tz").notNull(),
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
