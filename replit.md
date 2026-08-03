# Cart-to-WhatsApp Widget

A cart-abandonment recovery widget platform for Shopify D2C stores. When a shopper adds to cart but shows leave signals without checking out, the widget offers to continue on WhatsApp — capturing an opt-in that would otherwise be lost.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port assigned by workflow)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (runtime-managed by Replit; swap to Supabase connection string when ready)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval v8 (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/db/src/schema/stores.ts` — stores table (id/uuid = install token)
- `lib/db/src/schema/captures.ts` — captures table (cart snapshots from widget)
- `artifacts/api-server/src/routes/stores.ts` — store CRUD routes
- `artifacts/api-server/src/routes/captures.ts` — capture logging + CSV export

## Architecture decisions

- Store UUID doubles as the install token — the widget snippet is `<script data-store="{id}">`. No separate token table needed in v1.
- `cart_snapshot` is stored as raw `jsonb` — schema-free to accommodate any Shopify theme's cart shape.
- Codegen patches `import * as zod from 'zod'` → `import * as zod from 'zod/v4'` in generated files post-orval. This is required because orval v8 emits zod v4 API methods but the workspace catalog pins `zod@^3.25.76` (which exposes v4 via the `/v4` subpath). The patch is in `lib/api-spec/package.json` codegen script.
- Supabase Auth will be added in Part 5 (dashboard). For Parts 1-4, the existing PostgreSQL connection is sufficient — just update `DATABASE_URL` to Supabase's connection string to switch.
- CSV export is handled server-side via `?format=csv` query param on `GET /stores/:id/captures`.

## Product

- Store owners install a `<script>` tag in their Shopify theme
- Widget fires a soft nudge (Tier 1) after ~45-60s of idle time post add-to-cart
- If dismissed, fires a leave-signal nudge (Tier 2) on tab switch / mouse-to-tab-bar / back button
- On WhatsApp/SMS click, widget POSTs a capture (cart snapshot + tier + channel) to the API
- Dashboard shows captures list and lets store owners tweak config (number, mode, discount amount)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run codegen after changing `lib/api-spec/openapi.yaml`
- The orval codegen script patches generated zod imports — don't remove those `sed` commands from `lib/api-spec/package.json`
- `DATABASE_URL`, `PGHOST`, etc. are runtime-managed — do not set them manually
- Express 5 wildcard routes need named params: `/{*splat}` not `*`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Widget behavioral logic reference: `attached_assets/cart-whatsapp-widget-tiered-demo.html`
- Full build brief: `attached_assets/cart-widget-build-brief.md`
