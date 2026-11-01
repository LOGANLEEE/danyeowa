import { sqliteTable, text, integer, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: integer("created_at", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [uniqueIndex("push_subscriptions_endpoint_idx").on(table.endpoint)],
);

export const notificationPrefs = sqliteTable("notification_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  leadMinutes: integer("lead_minutes").notNull().default(120),
  // Arrival alerts are opt-outable on their own: someone who wants report reminders for their
  // own duty doesn't necessarily want a ping for every landing on their roster.
  arrivalEnabled: integer("arrival_enabled", { mode: "boolean" }).notNull().default(true),
});

/**
 * "Tell me when this paired person's roster changes." One row per (watcher, watched), default
 * absent = off. Seen state lives here, per watcher, not on the flights: a flight is deleted and
 * recreated on every edit, so a flag on it would be lost with the row.
 *
 * `lastFingerprint` null means no baseline yet — the first scan after enabling stores one and
 * sends nothing.
 */
export const rosterWatches = sqliteTable(
  "roster_watches",
  {
    watcherUserId: text("watcher_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    watchedUserId: text("watched_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    lastFingerprint: text("last_fingerprint"),
  },
  (table) => [primaryKey({ columns: [table.watcherUserId, table.watchedUserId] })],
);
