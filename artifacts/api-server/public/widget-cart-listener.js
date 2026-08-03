/**
 * widget-cart-listener.js — Shopify cart event detection module
 * =============================================================
 * Standalone draft for review. Not the full widget — just the cart-listening
 * layer that feeds into the tier logic.
 *
 * Strategy: four interception layers in order of reliability, all funneling
 * through a single `notifyCartUpdated()` call that fetches /cart.js to get
 * the true server-side cart state. We never trust client-side add-to-cart
 * signals alone because themes can add items in ways that bypass any single
 * button (upsell apps, auto-add gifts, bundle plugins).
 *
 * Layer 1: fetch() interception       → modern AJAX/drawer/section carts
 * Layer 2: XMLHttpRequest interception → jQuery-based / older themes
 * Layer 3: Native Shopify/theme events → theme-specific custom events
 * Layer 4: DOM mutation observer       → universal fallback (cart badge)
 *
 * KNOWN LIMITATIONS (flag for store #1 install):
 *
 *   A) Full-page-reload add-to-cart (rare today, some very old themes):
 *      Layers 1 & 2 don't survive a page reload. The mutation observer will
 *      catch the updated cart count on the resulting page, but the idle timer
 *      is fresh and the browsing context is new — this is effectively the
 *      same as a new session, so no recovery needed. ✓ Benign.
 *
 *   B) Headless / Storefront API stores:
 *      If the store uses Shopify's Storefront API instead of the AJAX Cart API
 *      (/cart/add.js), none of our interceptions will fire. The DOM mutation
 *      fallback may or may not help depending on whether the headless frontend
 *      updates a classic cart-count badge. FLAG THIS before onboarding any
 *      headless/Hydrogen store.
 *
 *   C) Script load order — widget loaded AFTER theme's cart library:
 *      XHR prototype patching works regardless of load order. fetch() patching
 *      works if the widget loads before the first add-to-cart action (not the
 *      first load of the cart library). With `defer`, we typically win this
 *      race because add-to-cart only happens on user interaction. ✓ Usually fine.
 *
 *   D) Cart apps that use internal fetch without hitting /cart/add.js:
 *      Some upsell apps (CartHook, ReConvert) make internal fetch calls to
 *      their own endpoints and then call Shopify's API internally. Our
 *      fetch/XHR intercept catches the Shopify call; the app's own network call
 *      is invisible. The DOM mutation fallback covers this if the cart badge
 *      updates. ✓ Covered by mutation fallback.
 *
 *   E) Themes that suppress the cart count badge entirely:
 *      Uncommon, but some minimalist themes show a cart icon with no count.
 *      In that case Layer 4 is blind. Layers 1-3 still work. ✓ Acceptable risk.
 */

(function () {
  'use strict';

  /**
   * initCartListener(onCartUpdated)
   *
   * @param {function(cart: object): void} onCartUpdated
   *   Called with the full /cart.js response object whenever the cart count
   *   increases. The `cart` object contains:
   *     - cart.item_count  {number}  total units in cart
   *     - cart.items       {array}   line items with title, price, quantity, product_type, etc.
   *     - cart.total_price {number}  in Shopify's lowest currency unit (pence/cents)
   */
  function initCartListener(onCartUpdated) {
    var lastKnownItemCount = 0;
    var fetchInFlight = false;

    // ── Debounced cart state sync ─────────────────────────────────────────────
    // All four layers call this. It fetches /cart.js and calls back only when
    // the cart count genuinely increased (ignoring removes or no-ops).
    function syncCart(source) {
      if (fetchInFlight) return;
      fetchInFlight = true;
      fetch('/cart.js', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (cart) {
          fetchInFlight = false;
          if (cart.item_count > lastKnownItemCount) {
            lastKnownItemCount = cart.item_count;
            onCartUpdated(cart);
          } else {
            // Cart changed but count didn't grow — update baseline silently
            lastKnownItemCount = cart.item_count;
          }
        })
        .catch(function () {
          fetchInFlight = false;
        });
    }

    // ── Layer 1: fetch() interception ─────────────────────────────────────────
    // Catches: Dawn, Debut, Brooklyn, and any theme using native fetch for cart.
    // Also catches most cart-drawer implementations and section-rendered carts.
    (function patchFetch() {
      var _fetch = window.fetch;
      window.fetch = function () {
        var args = Array.prototype.slice.call(arguments);
        var url = '';
        if (typeof args[0] === 'string') {
          url = args[0];
        } else if (args[0] && typeof args[0].url === 'string') {
          url = args[0].url; // Request object
        }

        var promise = _fetch.apply(this, args);

        if (/\/cart\/add(?:\.js)?(\?|$)/.test(url)) {
          // Don't block the original promise — tap into it as a side-effect
          promise.then(function (response) {
            if (response && response.ok) {
              // Small delay so Shopify has time to commit the add
              setTimeout(function () { syncCart('fetch'); }, 150);
            }
            return response;
          }).catch(function () { /* ignore */ });
        }

        return promise;
      };
    })();

    // ── Layer 2: XMLHttpRequest interception ──────────────────────────────────
    // Catches: Turbo (jQuery.ajax), Prestige, Flow, Empire, and any theme
    // using $.ajax / XMLHttpRequest for cart actions.
    (function patchXHR() {
      var _open = XMLHttpRequest.prototype.open;
      var _send = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function (method, url) {
        this._widgetUrl = String(url || '');
        return _open.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function () {
        if (/\/cart\/add(?:\.js)?(\?|$)/.test(this._widgetUrl || '')) {
          var xhr = this;
          xhr.addEventListener('load', function () {
            // status 200 or 422 (422 = item already at max qty, cart unchanged)
            if (xhr.status === 200) {
              setTimeout(function () { syncCart('xhr'); }, 150);
            }
          });
        }
        return _send.apply(this, arguments);
      };
    })();

    // ── Layer 3: Native Shopify / theme custom events ─────────────────────────
    // Many popular themes dispatch their own cart events. We listen on both
    // document and window since themes vary on which target they use.
    //
    // Event name catalogue (known at time of writing):
    //   cart:item-added     — Dawn theme (official Shopify), Refresh, Crave
    //   cart:add            — several commercial themes
    //   cart:updated        — generic; several themes fire on any cart change
    //   cart:refresh        — Broadcast, Impulse
    //   product:added-to-cart — Turbo (Out of the Sandbox)
    //   on:cart:add         — Expanse (Archetype)
    //   cart-add:add        — Symmetry (Clean Canvas)
    //   theme:cart:add-to-cart — several premium themes
    //   cart-drawer:refresh — Dawn-variant themes
    //   alo:cart:updated    — Alo theme variant
    var themeCartEvents = [
      'cart:item-added',
      'cart:add',
      'cart:updated',
      'cart:refresh',
      'product:added-to-cart',
      'on:cart:add',
      'cart-add:add',
      'theme:cart:add-to-cart',
      'cart-drawer:refresh',
      'alo:cart:updated',
      'dispatch:cart-update',    // some headless-lite setups
      'shopify:cart:add',        // documented in some Shopify docs for sections
    ];

    themeCartEvents.forEach(function (eventName) {
      document.addEventListener(eventName, function () { syncCart('event:' + eventName); }, { passive: true });
      window.addEventListener(eventName, function () { syncCart('event:' + eventName); }, { passive: true });
    });

    // ── Layer 4: DOM mutation observer (universal fallback) ───────────────────
    // Watches for changes to cart-count badge elements in the DOM. This fires
    // for themes that don't use /cart/add.js directly or dispatch known events,
    // as long as they update a visible cart count somewhere in the DOM.
    //
    // We look for elements whose class or id contains cart-count / cart-quantity
    // keywords. When the numeric content increases, we syncCart.
    (function initMutationFallback() {
      // Selector battery — covers class names and ids from common themes
      var countSelectors = [
        '[class*="cart-count"]',
        '[class*="cart-item-count"]',
        '[class*="cart-quantity"]',
        '[class*="CartCount"]',
        '[class*="CartItemCount"]',
        '[id*="cart-count"]',
        '[id*="CartCount"]',
        '[id*="cart-item-count"]',
        '[data-cart-count]',
        '[data-count]',
      ].join(',');

      var lastDOMCount = null;

      function readCountFromDOM() {
        try {
          var el = document.querySelector(countSelectors);
          if (!el) return null;
          // Check data attribute first (more reliable)
          var da = el.getAttribute('data-cart-count') || el.getAttribute('data-count');
          if (da !== null) {
            var dn = parseInt(da, 10);
            if (!isNaN(dn)) return dn;
          }
          // Fall back to text content
          var text = el.textContent.trim();
          // Handle "(2)" or "2 items" formats
          var match = text.match(/\d+/);
          if (match) return parseInt(match[0], 10);
        } catch (_) { /* ignore */ }
        return null;
      }

      if (typeof MutationObserver === 'undefined') return;

      var observer = new MutationObserver(function () {
        var count = readCountFromDOM();
        if (count === null) return;
        if (lastDOMCount !== null && count > lastDOMCount) {
          syncCart('mutation');
        }
        lastDOMCount = count;
      });

      observer.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-cart-count', 'data-count', 'class'],
      });

      // Seed the DOM count baseline
      lastDOMCount = readCountFromDOM();
    })();

    // ── Seed the baseline cart count ──────────────────────────────────────────
    // Fetch the current cart on init so we know where to start counting from.
    // This prevents firing on the first layer-4 mutation if the shopper
    // already has items in cart from a previous session.
    fetch('/cart.js', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        lastKnownItemCount = cart.item_count;
      })
      .catch(function () { /* non-fatal — layer 4 will still work */ });
  }

  // ── Usage example (will be wired into the full widget): ──────────────────────
  //
  //   initCartListener(function(cart) {
  //     console.log('[CartWidget] Cart updated:', cart.item_count, 'items');
  //     console.log('First item type:', cart.items[0] && cart.items[0].product_type);
  //     // → trigger tier logic here
  //   });

  // Expose for the next phase of widget assembly
  if (typeof window !== 'undefined') {
    window._CartWidgetListener = initCartListener;
  }

})();
