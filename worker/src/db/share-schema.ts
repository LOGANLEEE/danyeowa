import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

export const shareLinks = sqliteTable(
  "share_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    label: text("label"),
    createdAt: integer("created_at", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now()),
    revokedAt: integer("revoked_at", { mode: "number" }),
  },
  (table) => [uniqueIndex("share_links_token_idx").on(table.token)],
);
