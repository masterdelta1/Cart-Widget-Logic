import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores";

export const eventTypeEnum = pgEnum("event_type", [
  "shown",
  "clicked",
  "dismissed",
  "purchased",
]);

export const eventTriggerEnum = pgEnum("widget_trigger_type", [
  "engagement",
  "exit",
]);

export const widgetEventsTable = pgTable("widget_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => storesTable.id),
  sessionId: text("session_id").notNull(),
  trigger: eventTriggerEnum("trigger"),
  eventType: eventTypeEnum("event_type").notNull(),
  orderValue: jsonb("order_value"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertWidgetEventSchema = createInsertSchema(
  widgetEventsTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertWidgetEvent = z.infer<typeof insertWidgetEventSchema>;
export type WidgetEvent = typeof widgetEventsTable.$inferSelect;
