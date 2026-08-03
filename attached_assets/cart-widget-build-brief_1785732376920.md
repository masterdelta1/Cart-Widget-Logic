# Build Brief: Cart-to-WhatsApp Widget (MVP)

## What this is
A cart-abandonment recovery widget for Shopify D2C stores. When a shopper adds to cart but shows signs of leaving without checking out, the widget offers to continue the conversation on WhatsApp — capturing an opt-in that would otherwise be lost (60-70% of cart-adders never reach checkout, and most never gave an email either).

This is NOT a generic popup builder. It's a specific, opinionated tiered-nudge system. Preserve the exact behavioral logic below — it's already been designed and validated in a working prototype (attached separately as reference: `cart-whatsapp-widget-tiered-demo.html`). Your job is to make it real, not redesign it.

## Non-goals for this build (do not add these — they slow us down and aren't needed for the first 5-10 stores)
- No billing/subscriptions
- No teams/multi-user per store
- No analytics dashboards/charts
- No settings beyond WhatsApp number + mode + discount amount
- No multi-language UI (Hinglish support in message templates only)
- No support for platforms other than Shopify in v1
- No email capture — WhatsApp/SMS only

---

## Part 1: Widget behavioral logic (already validated — port as-is)

Reference file `cart-whatsapp-widget-tiered-demo.html` contains the full working logic. Key mechanics to preserve exactly:

**Tier 1 (soft nudge):**
- Fires once, after ~45-60s of idle time following an add-to-cart (demo uses 6s for testing — production should use 45000-60000ms)
- Never fires more than once per session
- If cart grows to 2+ items before Tier 1 fires, restart the idle timer

**Tier 2 (leave-signal nudge):**
- Only eligible if Tier 1 was shown AND dismissed (not converted)
- Fires on a real leave-signal: tab/app switch (`visibilitychange`), mouse leaving toward the tab bar (`mouseout` with `clientY <= 0`), or back button/swipe (intercepted via `history.pushState` trap + `popstate` listener)
- Fires once only, ever, per session

**Hard stops:**
- Once converted (WhatsApp or SMS link clicked), no more popups for the rest of the session
- Once Tier 2 is dismissed, stay silent for the rest of the session

**Message personalization:**
- Two brand modes: `personalized` (hook text varies by product type, uses a `HOOKS` lookup by product type) and `discount` (flat rupee-amount-off hook, Hinglish copy included)
- Cart with 2+ items gets a different hook than single-item cart
- WhatsApp deep link (`wa.me/{number}?text=...`) and SMS fallback (`sms:{number}?body=...`) both pre-fill a message with cart contents and the relevant hook

Port this logic into a widget module that runs against a real store's real cart, not simulated state.

---

## Part 2: Real cart hook (the hard part — do this carefully)

Replace the fake `addToCart()` button-click handler with real Shopify cart event listening:
- Hook Shopify's AJAX Cart API: listen for `/cart/add.js` calls (via fetch/XHR interception, or the theme's native cart events if the theme dispatches them)
- Must work across different theme cart implementations (drawer carts, page carts, AJAX carts) without assuming a specific theme's JS structure
- Pull current cart state via `/cart.js` when needed, don't just track state client-side from click events alone — themes can add to cart in ways that bypass a single button
- Flag explicitly in your build notes any theme patterns you can't reliably support yet, so we know the limitations going into store #1's install

---

## Part 3: Backend + Database

**Stack:** Supabase (Postgres + Auth) — use this instead of hand-rolling auth or standing up separate DB infra. Fastest path to something live.

**Schema (minimum):**
```
stores
  id (uuid, pk)
  owner_email
  store_domain
  whatsapp_number
  sms_number (nullable)
  mode ('personalized' | 'discount')
  discount_amount (nullable)
  currency (default '₹')
  created_at

captures
  id (uuid, pk)
  store_id (fk -> stores.id)
  tier (1 | 2)
  channel ('whatsapp' | 'sms')
  cart_snapshot (jsonb — items, prices, at time of capture)
  created_at
```

**Endpoints needed:**
- `POST /api/stores` — create store on signup, generate unique install token/store_id
- `GET /api/stores/:id/config` — widget fetches this on load (whatsapp_number, mode, discount_amount) instead of hardcoded JS constants
- `PATCH /api/stores/:id` — update config from dashboard
- `POST /api/captures` — widget posts here on WhatsApp/SMS link click (cart snapshot, tier, channel)
- `GET /api/stores/:id/captures` — dashboard reads captures list, with CSV export

---

## Part 4: Widget delivery (script snippet)

The widget must ship as a single external script a store owner pastes into their theme:
```html
<script src="https://yourapp.com/widget.js" data-store="{store_id}" defer></script>
```
On load, it fetches `/api/stores/:id/config`, then attaches the cart listeners and tier logic from Part 1/2 using that config instead of hardcoded constants.

Keep this file dependency-free and small — no frameworks, vanilla JS, so it doesn't conflict with the host theme or slow their page down.

---

## Part 5: Dashboard (bare minimum)

- Login/signup (Supabase Auth)
- One settings page: WhatsApp number, SMS number, mode toggle, discount amount, install snippet with copy button
- One captures list page: table of captures (date, tier, channel, cart contents), CSV export button
- Nothing else in v1

---

## Build order (suggested)
1. Supabase project: schema + auth
2. Backend API (config fetch, capture logging, CRUD for store settings)
3. Port widget logic from the reference HTML into a standalone `widget.js`, wired to real Shopify cart events and the config API instead of hardcoded state
4. Dashboard: auth pages + settings page + captures table
5. Test install on one real Shopify dev store before going to real merchants

## Reference file
`cart-whatsapp-widget-tiered-demo.html` — attach this alongside the prompt. It contains the exact tier timing, message templates, and leave-signal detection code to port.
