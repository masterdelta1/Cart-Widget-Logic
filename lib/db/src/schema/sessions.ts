import { index, json, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Persistent session storage for express-session/connect-pg-simple.
 * Keep this shape aligned with connect-pg-simple's table.sql.
 */
export const sessionsTable = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);