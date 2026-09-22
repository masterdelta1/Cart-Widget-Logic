import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@workspace/db";
import { widgetEventsTable, storesTable } from "@workspace/db";
import { requireAuth, requireOwnStore } from "../lib/auth-middleware";

const router: IRouter = Router();

const CreateEventBody = z.object({
  store_id: z.uuid(),
  session_id: z.string().min(1),
  trigger: z.enum(["engagement", "exit"]).nullish(),
  event_type: z.enum(["shown", "clicked", "dismissed", "purchased"]),
  order_value: z.unknown().nullish(),
});

router.post("/events", async (req, res): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  const [store] = await db
    .select({ id: storesTable.id })
    .from(storesTable)
    .where(eq(storesTable.id, data.store_id));

  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const [event] = await db
    .insert(widgetEventsTable)
    .values({
      storeId: data.store_id,
      sessionId: data.session_id,
      trigger: data.trigger ?? null,
      eventType: data.event_type,
      orderValue: data.order_value ?? null,
    })
    .returning();

  res.status(201).json({ id: event.id });
});

router.get(
  "/stores/:id/funnel",
  requireAuth,
  requireOwnStore,
  async (req, res): Promise<void> => {
    const storeId = req.params.id;

    const [store] = await db
      .select({ id: storesTable.id })
      .from(storesTable)
      .where(eq(storesTable.id, storeId));

    if (!store) {
      res.status(404).json({ error: "Store not found" });
      return;
    }

    const rows = await db
      .select({
        eventType: widgetEventsTable.eventType,
        count: sql<number>`count(distinct ${widgetEventsTable.sessionId})`,
      })
      .from(widgetEventsTable)
      .where(eq(widgetEventsTable.storeId, storeId))
      .groupBy(widgetEventsTable.eventType);

    const funnel = { shown: 0, clicked: 0, dismissed: 0, purchased: 0 };
    for (const row of rows) {
      funnel[row.eventType] = Number(row.count);
    }

    res.json({ store_id: storeId, funnel });
  },
);

export default router;
