import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { storesTable } from "@workspace/db";
import {
  CreateStoreBody,
  CreateStoreResponse,
  GetStoreConfigParams,
  GetStoreConfigResponse,
  UpdateStoreParams,
  UpdateStoreBody,
  UpdateStoreResponse,
} from "@workspace/api-zod";
import { requireAuth, requireOwnStore } from "../lib/auth-middleware";

const router: IRouter = Router();

/**
 * POST /stores
 * Create a store on signup. Returns the store record including its UUID,
 * which serves as the install token for the widget snippet.
 */
router.post("/stores", async (req, res): Promise<void> => {
  const parsed = CreateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const [store] = await db
    .insert(storesTable)
    .values({
      ownerEmail: data.owner_email,
      storeDomain: data.store_domain,
      whatsappNumber: data.whatsapp_number,
      smsNumber: data.sms_number ?? null,
      personaName: data.persona_name ?? "Rohan",
      mode: data.mode,
      discountAmount: data.discount_amount ?? null,
      currency: data.currency ?? "₹",
    })
    .returning();

  res.status(201).json(
    CreateStoreResponse.parse({
      id: store.id,
      owner_email: store.ownerEmail,
      store_domain: store.storeDomain,
      whatsapp_number: store.whatsappNumber,
      sms_number: store.smsNumber,
      persona_name: store.personaName,
      mode: store.mode,
      discount_amount: store.discountAmount,
      currency: store.currency,
      created_at: store.createdAt,
    })
  );
});

/**
 * GET /stores/:id/config
 * Called by the widget on load to fetch whatsapp_number, mode, discount_amount, currency.
 */
router.get("/stores/:id/config", async (req, res): Promise<void> => {
  const params = GetStoreConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, params.data.id));

  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  res.json(
    GetStoreConfigResponse.parse({
      whatsapp_number: store.whatsappNumber,
      sms_number: store.smsNumber,
      persona_name: store.personaName,
      mode: store.mode,
      discount_amount: store.discountAmount,
      currency: store.currency,
    })
  );
});

/**
 * PATCH /stores/:id
 * Update store config from the dashboard.
 */
router.patch("/stores/:id", requireAuth, requireOwnStore, async (req, res): Promise<void> => {
  const params = UpdateStoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const updatePayload: Partial<typeof storesTable.$inferInsert> = {};
  if (data.whatsapp_number !== undefined)
    updatePayload.whatsappNumber = data.whatsapp_number;
  if (data.sms_number !== undefined) updatePayload.smsNumber = data.sms_number;
  if (data.persona_name !== undefined) updatePayload.personaName = data.persona_name;
  if (data.mode !== undefined) updatePayload.mode = data.mode;
  if (data.discount_amount !== undefined)
    updatePayload.discountAmount = data.discount_amount;
  if (data.currency !== undefined) updatePayload.currency = data.currency;

  const [store] = await db
    .update(storesTable)
    .set(updatePayload)
    .where(eq(storesTable.id, params.data.id))
    .returning();

  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }

  res.json(
    UpdateStoreResponse.parse({
      id: store.id,
      owner_email: store.ownerEmail,
      store_domain: store.storeDomain,
      whatsapp_number: store.whatsappNumber,
      sms_number: store.smsNumber,
      persona_name: store.personaName,
      mode: store.mode,
      discount_amount: store.discountAmount,
      currency: store.currency,
      created_at: store.createdAt,
    })
  );
});

export default router;
