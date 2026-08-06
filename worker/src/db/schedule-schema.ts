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
  },
  (table) => [primaryKey({ columns: [table.flightNo, table.legSeq] })]
);
