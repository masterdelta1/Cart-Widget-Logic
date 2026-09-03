---
name: Session and widget delivery quirks
description: Reverse-proxy sessions and esbuild delivery constraints for the cart widget platform.
---

Express sessions must trust the Replit proxy and use secure cookies when served through the HTTPS proxy. The persistent connect-pg-simple table should be managed by the Drizzle schema rather than relying on its automatic table creation in an esbuild bundle.

**Why:** connect-pg-simple's automatic setup reads its package-local table.sql using runtime `__dirname`; the esbuild output does not contain that asset, so session cookies can be emitted while session writes fail with an ENOENT error.

**How to apply:** Keep the session table in the database schema and disable automatic table creation, while retaining `app.set("trust proxy", 1)` and HTTPS-compatible cookie settings. Widget install attributes must match exactly; accept the dashboard's `data-store-id` and legacy `data-store`.