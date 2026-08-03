import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

// At runtime __dirname is always the compiled dist/ directory (dev script builds first).
// dist/ → ../public/widget.js → artifacts/api-server/public/widget.js
const widgetPath = path.resolve(__dirname, "../public/widget.js");

/**
 * GET /widget.js
 * Serves the cart-to-WhatsApp widget script.
 * Store owners paste this into their Shopify theme:
 *   <script src="https://yourapp.com/widget.js" data-store="{store_id}" defer></script>
 *
 * Note: This route is registered at the Express app level (before the /api prefix)
 * and the service path "/widget.js" is declared in artifact.toml so the proxy routes it here.
 */
router.get("/widget.js", (req, res): void => {
  if (!fs.existsSync(widgetPath)) {
    res.status(404).send("/* widget.js not found */");
    return;
  }
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  // Short cache in dev; bump to longer TTL in production once stable
  res.setHeader("Cache-Control", "public, max-age=60");
  // Allow any Shopify storefront to load this script
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.sendFile(widgetPath);
});

export default router;
