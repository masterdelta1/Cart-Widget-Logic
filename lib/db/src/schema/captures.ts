import {
  pgTable,
  uuid,
  integer,
  text,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores";

export const captureChannelEnum = pgEnum("capture_channel", [
  "whatsapp",
  "sms",
]);

export const capturesTable = pgTable("captures", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => storesTable.id),
  tier: integer("tier").notNull(), // 1 or 2
  channel: captureChannelEnum("channel").notNull(),
  cartSnapshot: jsonb("cart_snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCaptureSchema = createInsertSchema(capturesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCapture = z.infer<typeof insertCaptureSchema>;
export type Capture = typeof capturesTable.$inferSelect;
