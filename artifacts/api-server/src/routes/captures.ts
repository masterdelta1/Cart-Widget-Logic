import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { capturesTable, storesTable } from "@workspace/db";
import {
  CreateCaptureBody,
  CreateCaptureResponse,
  GetStoreCapturesParams,
  GetStoreCapturesQueryParams,
  GetStoreCapturesResponse,
} from "@workspace/api-zod";
import { requireAuth, requireOwnStore } from "../lib/auth-middleware";

const router: IRouter = Router();

/**
 * POST /captures
 * Widget posts here when a shopper clicks WhatsApp or SMS link.
 * Records cart snapshot, tier, and channel.
 */
router.post("/captures", async (req, res): Promise<void> => {
  const parsed = CreateCaptureBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;

  // Verify the store exists
  const [store] = await db
    .select({ id: storesTable.id })
    .from(storesTable)
    .where(eq(storesTable.id, data.store_id));

  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const [capture] = await db
    .insert(capturesTable)
    .values({
      storeId: data.store_id,
      tier: data.tier,
      channel: data.channel,
      cartSnapshot: data.cart_snapshot,
    })
    .returning();

  res.status(201).json(
    CreateCaptureResponse.parse({
      id: capture.id,
      store_id: capture.storeId,
      tier: capture.tier,
      channel: capture.channel,
      cart_snapshot: capture.cartSnapshot,
      created_at: capture.createdAt,
    })
  );
});

/**
 * GET /stores/:id/captures
 * Returns all captures for a store.
 * Pass ?format=csv to get a CSV export instead of JSON.
 */
router.get("/stores/:id/captures", requireAuth, requireOwnStore, async (req, res): Promise<void> => {
  const params = GetStoreCapturesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const query = GetStoreCapturesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  // Verify the store exists
  const [store] = await db
    .select({ id: storesTable.id })
    .from(storesTable)
    .where(eq(storesTable.id, params.data.id));

  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  const captures = await db
    .select()
    .from(capturesTable)
    .where(eq(capturesTable.storeId, params.data.id))
    .orderBy(desc(capturesTable.createdAt));

  // CSV export
  if (query.data.format === "csv") {
    const rows = [
      ["id", "store_id", "tier", "channel", "cart_snapshot", "created_at"],
      ...captures.map((c) => [
        c.id,
        c.storeId,
        String(c.tier),
        c.channel,
        JSON.stringify(c.cartSnapshot),
        c.createdAt.toISOString(),
      ]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="captures-${params.data.id}.csv"`
    );
    res.send(csv);
    return;
  }

  res.json(
    GetStoreCapturesResponse.parse({
      captures: captures.map((c) => ({
        id: c.id,
        store_id: c.storeId,
        tier: c.tier,
        channel: c.channel,
        cart_snapshot: c.cartSnapshot,
        created_at: c.createdAt,
      })),
      total: captures.length,
    })
  );
});

export default router;
