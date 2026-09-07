---
name: Session and widget delivery quirks
description: Reverse-proxy sessions and esbuild delivery constraints for the cart widget platform.
---

Express sessions must trust the Replit proxy and use secure cookies when served through the HTTPS proxy. The persistent connect-pg-simple table should be managed by the Drizzle schema rather than relying on its automatic table creation in an esbuild bundle.

**Why:** connect-pg-simple's automatic setup reads its package-local table.sql using runtime `__dirname`; the esbuild output does not contain that asset, so session cookies can be emitted while session writes fail with an ENOENT error.

**How to apply:** Keep the session table in the database schema and disable automatic table creation, while retaining `app.set("trust proxy", 1)` and HTTPS-compatible cookie settings. Widget install attributes must match exactly; accept the dashboard's `data-store-id` and legacy `data-store`.

Route-protection effects must guard against navigating to the route they are already on before calling Wouter's `setLocation`; otherwise the development router can repeatedly push history and hit React's maximum update depth.

Custom storefronts must explicitly forward their framework cart state to the widget through the documented browser bridge; the widget cannot inspect a React context or provider from another application. Common item keys include name/title, qty/quantity, price, and img/image.

Cart snapshots need an explicit price-unit marker: Shopify `/cart.js` totals are minor units, while custom bridge totals are major currency units. Dashboard formatting should honor the marker and infer legacy custom shapes only when the marker is absent.

The widget's trigger model is first-trigger-wins within browser sessionStorage: exit intent handles all carts, while engagement handles the configured add-to-cart threshold or product/collection dwell and can never fire after exit.

**Why:** Overlapping idle, cart, and exit signals made behavior unpredictable and produced competing popups; a single session lock keeps the handoff deterministic.

**How to apply:** Keep exit detection and engagement detection separate, but route both through one session-scoped claim before rendering any popup.