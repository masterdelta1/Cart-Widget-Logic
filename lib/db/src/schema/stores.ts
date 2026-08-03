import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const storeModeEnum = pgEnum("store_mode", ["personalized", "discount"]);

export const storesTable = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerEmail: text("owner_email").notNull(),
  storeDomain: text("store_domain").notNull(),
  whatsappNumber: text("whatsapp_number").notNull(),
  smsNumber: text("sms_number"),
  mode: storeModeEnum("mode").notNull().default("personalized"),
  discountAmount: integer("discount_amount"),
  currency: text("currency").notNull().default("₹"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertStoreSchema = createInsertSchema(storesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof storesTable.$inferSelect;
