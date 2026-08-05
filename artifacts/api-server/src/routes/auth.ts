import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { storesTable } from "@workspace/db";
import {
  SignupBody,
  SignupResponse,
  LoginBody,
  LoginResponse,
  LogoutResponse,
  GetCurrentUserResponse,
} from "@workspace/api-zod";
const router: IRouter = Router();
function toStoreResponse(store: typeof storesTable.$inferSelect) {
  return {
    id: store.id,
    owner_email: store.ownerEmail,
    store_domain: store.storeDomain,
    whatsapp_number: store.whatsappNumber,
    sms_number: store.smsNumber,
    mode: store.mode,
    discount_amount: store.discountAmount,
    currency: store.currency,
    created_at: store.createdAt,
  };
}
/**
 * POST /auth/signup
 * Creates a store owner account + store row in one step, then starts a session.
 */
router.post("/auth/signup", async (req, res): Promise<void> => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { owner_email, password, store_domain } = parsed.data;
  const [existing] = await db
    .select({ id: storesTable.id })
    .from(storesTable)
    .where(eq(storesTable.ownerEmail, owner_email));
  if (existing) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const [store] = await db
    .insert(storesTable)
    .values({
      ownerEmail: owner_email,
      storeDomain: store_domain,
      passwordHash,
    })
    .returning();
  req.session.storeId = store.id;
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Session save failed" });
      return;
    }
    res.status(201).json(SignupResponse.parse(toStoreResponse(store)));
  });
});
/**
 * POST /auth/login
 */
router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { owner_email, password } = parsed.data;
  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.ownerEmail, owner_email));
  if (!store || !store.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  const valid = await bcrypt.compare(password, store.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  req.session.storeId = store.id;
  req.session.save((err) => {
    if (err) {
      res.status(500).json({ error: "Session save failed" });
      return;
    }
    res.json(LoginResponse.parse(toStoreResponse(store)));
  });
});
/**
 * POST /auth/logout
 */
router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json(LogoutResponse.parse({ success: true }));
  });
});
/**
 * GET /auth/me
 */
router.get("/auth/me", async (req, res): Promise<void> => {
  if (!req.session.storeId) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  const [store] = await db
    .select()
    .from(storesTable)
    .where(eq(storesTable.id, req.session.storeId));
  if (!store) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  res.json(GetCurrentUserResponse.parse(toStoreResponse(store)));
});
export default router;
