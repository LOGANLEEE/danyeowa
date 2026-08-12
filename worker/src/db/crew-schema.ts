import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

/**
 * Crew sharing: one table, because an accepted invite IS the link. A second `crew_links` table
 * would carry exactly the information already recorded here, and the two could disagree.
 *
 * A pairing is active when `acceptedAt` is set and `revokedAt` is not. It is symmetric —
 * whoever sent the invite and whoever accepted it can each read the other's roster — but it is
 * read-only in both directions: nothing here grants write access, and no mutation route consults
 * this table at all. They resolve the owner from the session, never from a parameter.
 */
export const crewInvites = sqliteTable(
  "crew_invites",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Always stored lower-cased — the accept check compares it against the session email. */
    toEmail: text("to_email").notNull(),
    token: text("token").notNull(),
    createdAt: integer("created_at", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now()),
    acceptedAt: integer("accepted_at", { mode: "number" }),
    /** Set with `acceptedAt`; the invited address may belong to an account created later. */
    acceptedByUserId: text("accepted_by_user_id").references(() => user.id, { onDelete: "cascade" }),
    revokedAt: integer("revoked_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("crew_invites_token_idx").on(table.token),
    // Every read of "my crew" starts from one of these two columns.
    index("crew_invites_from_user_idx").on(table.fromUserId),
    index("crew_invites_accepted_by_idx").on(table.acceptedByUserId),
    index("crew_invites_to_email_idx").on(table.toEmail),
  ],
);
