/**
 * Cart-to-WhatsApp Widget
 * =======================
 * Drop-in script for Shopify themes and custom websites. Reads config from the
 * API, listens for cart updates, and hands shoppers to WhatsApp at two moments.
 *
 * Usage:
 *   <script src="https://yourapp.com/widget.js" data-store-id="{store_id}" defer></script>
 *
 * Custom websites should add data-cart-event="cart-to-whatsapp:updated" and
 * dispatch that event with the cart object in event.detail, or call
 * window.CartToWhatsAppWidget.updateCart(cart).
 *
 * The API base URL is derived from the script's own src (no extra data-* needed).
 * Override with data-api="https://..." if you're serving the widget from a CDN
 * that's different from your API domain.
 */
(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. BOOTSTRAP
  // ─────────────────────────────────────────────────────────────────────────────

  var script = document.currentScript ||
    (function () {
      var tags = document.querySelectorAll('script[data-store-id], script[data-store]');
      return tags[tags.length - 1]; // last matching tag if currentScript is unavailable
    })();

  // data-store-id is the dashboard's install-snippet attribute. Keep
  // data-store as a backwards-compatible alias for older snippets.
  var storeId = script && (script.getAttribute('data-store-id') || script.getAttribute('data-store'));
  if (!storeId) {
    // Fail silently — don't break the merchant's storefront
    return;
  }

  var customCartEventName = (script && script.getAttribute('data-cart-event')) ||
    'cart-to-whatsapp:updated';
  var customCartHandler = null;
  var customCartQueue = [];
  // Shopify's /cart.js uses minor units; custom cart bridges use major units
  // unless data-cart-price-unit="minor" is explicitly provided.
  var cartPriceUnit = 'minor';

  function receiveCustomCart(cartData) {
    if (customCartHandler) {
      customCartHandler(cartData);
    } else {
      customCartQueue.push(cartData);
    }
  }

  window.addEventListener(customCartEventName, function (event) {
    receiveCustomCart(event.detail);
  });
  document.addEventListener(customCartEventName, function (event) {
    receiveCustomCart(event.detail);
  });

  // Expose a small framework-agnostic bridge for React, Next.js, and other
  // custom carts. The function also buffers updates until config is loaded.
  window.CartToWhatsAppWidget = window.CartToWhatsAppWidget || {};
  window.CartToWhatsAppWidget.updateCart = receiveCustomCart;

  // Derive API base from the script's own src URL, or allow explicit override
  var API_BASE = (script && script.getAttribute('data-api')) ||
    (function () {
      var src = (script && script.src) || '';
      var m = src.match(/^(https?:\/\/[^/]+)/);
      return m ? m[1] + '/api' : '/api';
    })();

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. CONFIG
  // ─────────────────────────────────────────────────────────────────────────────

  var config = null; // populated by fetchConfig()

  function fetchConfig(onReady) {
    fetch(API_BASE + '/stores/' + storeId + '/config')
      .then(function (r) {
        if (!r.ok) throw new Error('config fetch failed: ' + r.status);
        return r.json();
      })
      .then(function (data) {
        config = data;
        onReady();
      })
      .catch(function () {
        // Non-fatal: fail silently if config can't be loaded
      });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. TWO-TRIGGER CONFIGURATION & PAGE CONTEXT
  // ─────────────────────────────────────────────────────────────────────────────

  // Two trigger constants. Keep these together so engagement behavior is easy
  // to tune without scattering magic numbers through the event handlers.
  var ENGAGEMENT_ADD_TO_CART_THRESHOLD = 2;
  var ENGAGEMENT_DWELL_THRESHOLD_SECONDS = 45;
  var SESSION_TRIGGER_KEY = 'cart-to-whatsapp:trigger';
  var ENGAGEMENT_TRIGGER_KEY = 'cart-to-whatsapp:engagement-triggered';
  var EXIT_TRIGGER_KEY = 'cart-to-whatsapp:exit-triggered';
  var engagementTriggered = false;
  var exitTriggered = false;

  try {
    var legacyTrigger = window.sessionStorage.getItem(SESSION_TRIGGER_KEY);
    engagementTriggered =
      window.sessionStorage.getItem(ENGAGEMENT_TRIGGER_KEY) === '1' ||
      legacyTrigger === 'engagement';
    exitTriggered =
      window.sessionStorage.getItem(EXIT_TRIGGER_KEY) === '1' ||
      legacyTrigger === 'exit';
  } catch (_) {}

  function claimEngagement() {
    if (engagementTriggered || converted) return false;
    engagementTriggered = true;
    try {
      window.sessionStorage.setItem(ENGAGEMENT_TRIGGER_KEY, '1');
    } catch (_) {}
    return true;
  }

  function claimExit() {
    if (exitTriggered || converted) return false;
    exitTriggered = true;
    try {
      window.sessionStorage.setItem(EXIT_TRIGGER_KEY, '1');
    } catch (_) {}
    return true;
  }

  function formatCategory(value) {
    return String(value || '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function getPageContext() {
    var analytics = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
    var product = analytics && analytics.product;
    var themeMeta = window.meta && window.meta.product;
    var productType = (product && (product.type || product.product_type)) ||
      (themeMeta && (themeMeta.type || themeMeta.product_type)) || '';
    var typeMeta = document.querySelector(
      'meta[name="product_type"], meta[property="product:type"], [data-product-type]'
    );
    var collectionMeta = document.querySelector(
      'meta[name="collection_handle"], [data-collection-handle]'
    );

    productType = productType ||
      (typeMeta && (typeMeta.content || typeMeta.getAttribute('data-product-type'))) || '';
    var collectionHandle = collectionMeta &&
      (collectionMeta.content || collectionMeta.getAttribute('data-collection-handle'));
    if (!collectionHandle) {
      var collectionMatch = window.location.pathname.match(/\/collections\/([^/?#]+)/);
      collectionHandle = collectionMatch && collectionMatch[1];
    }

    var category = formatCategory(productType || collectionHandle);
    var isProductOrCollectionPage = Boolean(category) ||
      /\/products\/|\/collections\//.test(window.location.pathname);
    return {
      category: category,
      isCategoryPage: Boolean(category),
      isProductOrCollectionPage: isProductOrCollectionPage,
    };
  }

  function getStoreLabel() {
    if (config && config.store_domain) return config.store_domain;
    var host = window.location.hostname.replace(/^www\./, '');
    if (host && host !== 'localhost') return host;
    return document.title || 'this store';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. SHOPIFY CART NORMALISATION
  //
  // /cart.js items → our internal format for message generation and display.
  // Price comes back in paise/cents from Shopify — divide by 100.
  // ─────────────────────────────────────────────────────────────────────────────

  function normaliseCart(shopifyCart) {
    var currency = (config && config.currency) || '₹';
    return (shopifyCart.items || []).map(function (item) {
      var priceDisplay = currency + Math.round(item.price / 100);
      return {
        name:         item.title,
        type:         item.product_type || '',
        qty:          item.quantity,
        price:        priceDisplay,          // formatted, e.g. "₹999"
        priceRaw:     item.price,            // raw paise/cents from Shopify
        variantTitle: item.variant_title || '',
        imageUrl:     (item.featured_image && item.featured_image.url) || null,
      };
    });
  }

  function getCustomCartItems(customCart) {
    if (Array.isArray(customCart)) return customCart;
    if (customCart && Array.isArray(customCart.items)) return customCart.items;
    if (customCart && customCart.cart && Array.isArray(customCart.cart.items)) {
      return customCart.cart.items;
    }
    return [];
  }

  function getCustomCartCount(customCart, items) {
    if (customCart && typeof customCart.item_count === 'number') return customCart.item_count;
    return items.reduce(function (total, item) {
      return total + Number(item.quantity || item.qty || 1);
    }, 0);
  }

  function getCustomCartPrice(item) {
    if (typeof item.price === 'number') return item.price;
    if (typeof item.amount === 'number') return item.amount;
    if (typeof item.priceRaw === 'number') return item.priceRaw;
    return 0;
  }

  function normaliseCustomCart(customCart) {
    var currency = (config && config.currency) || '₹';
    var items = getCustomCartItems(customCart);
    var priceUnit = script && script.getAttribute('data-cart-price-unit');
    var isMinorUnit = priceUnit === 'minor';

    return items.map(function (item) {
      var price = getCustomCartPrice(item);
      var displayPrice = isMinorUnit ? price / 100 : price;
      return {
        name: item.name || item.title || (item.product && item.product.title) || 'Item',
        type: item.product_type || item.productType || item.type || '',
        qty: Number(item.quantity || item.qty || 1),
        price: currency + Math.round(displayPrice),
        priceRaw: price,
        variantTitle: item.variant_title || item.variantTitle || '',
        imageUrl: item.imageUrl || item.image || item.image_url || item.img ||
          (item.featured_image && item.featured_image.url) || null,
      };
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. CART EVENT DETECTION — four-layer interception
  //
  // All layers funnel into syncCart(), which fetches /cart.js and calls
  // onCartItemAdded(normalisedItems) only when item_count genuinely increased.
  // We never trust client-side signals alone — themes add items in too many
  // ways (upsell apps, auto-add gifts) to rely on any single signal.
  // ─────────────────────────────────────────────────────────────────────────────

  function initCartListener(onCartItemAdded) {
    var lastKnownCount = 0;
    var fetchInFlight = false;
    var customCartUrl = script && script.getAttribute('data-cart-url');
    var usesCustomBridge = Boolean(script && script.hasAttribute('data-cart-event'));
    var customPriceUnit = script && script.getAttribute('data-cart-price-unit') === 'minor'
      ? 'minor'
      : 'major';

    function handleCustomCart(customCart) {
      cartPriceUnit = customPriceUnit;
      var items = normaliseCustomCart(customCart);
      var count = getCustomCartCount(customCart, items);
      cart = items;
      cartRaw = customCart;
      if (count > lastKnownCount) {
        lastKnownCount = count;
        onCartItemAdded(items, customCart);
      } else {
        lastKnownCount = count;
      }
    }

    if (usesCustomBridge) {
      customCartHandler = handleCustomCart;
      customCartQueue.forEach(handleCustomCart);
      customCartQueue = [];
      return;
    }

    function syncCart() {
      if (fetchInFlight) return;
      fetchInFlight = true;
      fetch(customCartUrl || '/cart.js', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (cartSnapshot) {
          fetchInFlight = false;
          if (customCartUrl) cartPriceUnit = customPriceUnit;
          var items = customCartUrl
            ? normaliseCustomCart(cartSnapshot)
            : normaliseCart(cartSnapshot);
          var count = customCartUrl
            ? getCustomCartCount(cartSnapshot, items)
            : cartSnapshot.item_count;
          cart = items;
          cartRaw = cartSnapshot;
          if (count > lastKnownCount) {
            lastKnownCount = count;
            onCartItemAdded(items, cartSnapshot);
          } else {
            lastKnownCount = count;
          }
        })
        .catch(function () { fetchInFlight = false; });
    }

    // Layer 1: fetch() interception
    // Catches Dawn, Refresh, Crave, Cleo, and any theme using native fetch.
    (function () {
      var _fetch = window.fetch;
      window.fetch = function () {
        var args = Array.prototype.slice.call(arguments);
        var url = typeof args[0] === 'string' ? args[0]
          : (args[0] && typeof args[0].url === 'string') ? args[0].url : '';
        var promise = _fetch.apply(this, args);
        if (/\/cart\/add(?:\.js)?(\?|$)/.test(url)) {
          promise.then(function (resp) {
            if (resp && resp.ok) setTimeout(syncCart, 150);
            return resp;
          }).catch(function () {});
        }
        return promise;
      };
    })();

    // Layer 2: XMLHttpRequest interception
    // Catches Turbo, Prestige, Empire, Flow, jQuery.ajax-based themes.
    (function () {
      var _open = XMLHttpRequest.prototype.open;
      var _send = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (method, url) {
        this._cwUrl = String(url || '');
        return _open.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function () {
        if (/\/cart\/add(?:\.js)?(\?|$)/.test(this._cwUrl || '')) {
          var xhr = this;
          xhr.addEventListener('load', function () {
            if (xhr.status === 200) setTimeout(syncCart, 150);
          });
        }
        return _send.apply(this, arguments);
      };
    })();

    // Layer 3: Native theme/Shopify custom events
    // Many themes dispatch their own events — cover all known names.
    var themeEvents = [
      'cart:item-added', 'cart:add', 'cart:updated', 'cart:refresh',
      'product:added-to-cart', 'on:cart:add', 'cart-add:add',
      'theme:cart:add-to-cart', 'cart-drawer:refresh', 'shopify:cart:add',
    ];
    themeEvents.forEach(function (name) {
      document.addEventListener(name, function () { setTimeout(syncCart, 200); }, { passive: true });
      window.addEventListener(name, function () { setTimeout(syncCart, 200); }, { passive: true });
    });

    // Layer 4: DOM mutation observer — universal fallback
    // Watches cart-count badges for numeric increases.
    (function () {
      if (typeof MutationObserver === 'undefined') return;
      var selectors = [
        '[class*="cart-count"]', '[class*="cart-item-count"]',
        '[class*="cart-quantity"]', '[id*="cart-count"]',
        '[id*="CartCount"]', '[data-cart-count]',
      ].join(',');
      var lastDOMCount = null;
      function readDOM() {
        try {
          var el = document.querySelector(selectors);
          if (!el) return null;
          var da = el.getAttribute('data-cart-count') || el.getAttribute('data-count');
          if (da !== null) { var dn = parseInt(da, 10); if (!isNaN(dn)) return dn; }
          var m = (el.textContent || '').match(/\d+/);
          return m ? parseInt(m[0], 10) : null;
        } catch (_) { return null; }
      }
      new MutationObserver(function () {
        var count = readDOM();
        if (count === null) return;
        if (lastDOMCount !== null && count > lastDOMCount) setTimeout(syncCart, 250);
        lastDOMCount = count;
      }).observe(document.body, {
        subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ['data-cart-count', 'data-count'],
      });
      lastDOMCount = readDOM();
    })();

    // Seed baseline count
    fetch(customCartUrl || '/cart.js', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (c) {
        var items = customCartUrl ? normaliseCustomCart(c) : normaliseCart(c);
        cart = items;
        cartRaw = c;
        lastKnownCount = customCartUrl ? getCustomCartCount(c, items) : c.item_count;
      })
      .catch(function () {});
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. SESSION STATE & TWO-TRIGGER LOGIC
  // ─────────────────────────────────────────────────────────────────────────────

  var cart = [];           // normalised items (our format)
  var cartRaw = null;      // raw Shopify /cart.js snapshot (for capture POST)
  var converted = false;
  var activeTrigger = null;
  var engagementContext = null;
  var engagementReason = null;
  var selectedIntent = null;

  function onCartItemAdded(normalisedItems, shopifyCart) {
    cart = normalisedItems;
    cartRaw = shopifyCart;

    if (converted) return;
    if (getCartCount(shopifyCart, normalisedItems) >= ENGAGEMENT_ADD_TO_CART_THRESHOLD) {
      fireEngagement('cart_threshold');
    }
  }

  function getCartCount(rawCart, normalisedItems) {
    if (rawCart && typeof rawCart.item_count === 'number') return rawCart.item_count;
    return (normalisedItems || []).reduce(function (total, item) {
      return total + Number(item.qty || 1);
    }, 0);
  }

  function fireExitIntent() {
    if (!claimExit()) return;
    activeTrigger = 'exit';
    openWidget('exit');
  }

  function fireEngagement(reason) {
    if (!claimEngagement()) return;
    activeTrigger = 'engagement';
    engagementReason = reason || 'dwell';
    engagementContext = getPageContext();
    openWidget('engagement');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. LEAVE-SIGNAL DETECTION
  // Ported exactly from the demo.
  // ─────────────────────────────────────────────────────────────────────────────

  function initLeaveSignals() {
    // Tab / app switch is the mobile equivalent of leaving the page.
    var hiddenExitTimer = null;
    document.addEventListener('visibilitychange', function () {
      if (hiddenExitTimer) {
        clearTimeout(hiddenExitTimer);
        hiddenExitTimer = null;
      }
      if (document.hidden) {
        // Mobile back navigation can emit visibilitychange just before
        // popstate. Give the history trap a chance to intercept first.
        hiddenExitTimer = setTimeout(function () {
          if (document.hidden) fireExitIntent();
          hiddenExitTimer = null;
        }, 250);
      }
    });

    // Desktop mouse exit toward the browser chrome.
    document.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget && e.clientY <= 0) fireExitIntent();
    });

    // Edge-back gestures can begin navigating before popstate reaches the
    // page. Claim exit intent as soon as a rightward swipe starts at the edge.
    var touchStartX = null;
    var touchStartY = null;
    document.addEventListener('touchstart', function (e) {
      var touch = e.changedTouches && e.changedTouches[0];
      if (!touch) return;
      touchStartX = touch.clientX <= 32 ? touch.clientX : null;
      touchStartY = touchStartX === null ? null : touch.clientY;
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (touchStartX === null || exitTriggered || converted) return;
      var touch = e.changedTouches && e.changedTouches[0];
      if (!touch) return;
      var dx = touch.clientX - touchStartX;
      var dy = Math.abs(touch.clientY - touchStartY);
      if (dx >= 45 && dy < 80) {
        if (e.cancelable) e.preventDefault();
        fireExitIntent();
        try { history.pushState({ _cwTrap: true }, '', location.href); } catch (_) {}
        touchStartX = null;
        touchStartY = null;
      }
    }, { passive: false });
    document.addEventListener('touchend', function () {
      touchStartX = null;
      touchStartY = null;
    }, { passive: true });

    // Back button / back-swipe: push a trap history entry so the first
    // "back" action fires popstate instead of actually navigating away.
    try {
      history.pushState({ _cwTrap: true }, '', location.href);
    } catch (_) {}

    window.addEventListener('popstate', function () {
      if (!exitTriggered && !converted) {
        fireExitIntent();
        try { history.pushState({ _cwTrap: true }, '', location.href); } catch (_) {}
      }
    });
  }

  function initEngagementDwell() {
    setTimeout(function () {
      var pageContext = getPageContext();
      if (!engagementTriggered && !converted && pageContext.isProductOrCollectionPage) {
        fireEngagement('dwell');
      }
    }, ENGAGEMENT_DWELL_THRESHOLD_SECONDS * 1000);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. MESSAGE GENERATION
  // Messages use only the current cart and page context.
  // ─────────────────────────────────────────────────────────────────────────────

  function buildCartMessage() {
    return cart.map(function (item) {
      var quantity = item.qty > 1 ? ' x' + item.qty : '';
      return item.name + quantity;
    }).join(', ');
  }

  function buildExitMessage() {
    var storeLabel = getStoreLabel();
    if (!cart.length) {
      return 'Hi, I was checking out ' + storeLabel +
        ' and wanted some help finding something.';
    }
    return 'Hi, I was checking out ' + storeLabel +
      ' and wanted help with my cart: ' + buildCartMessage() + '.';
  }

  function buildEngagementMessage(intent) {
    var storeLabel = getStoreLabel();
    var category = engagementContext && engagementContext.category;
    var subject = category
      ? 'Hi, I was looking at ' + category + ' on ' + storeLabel
      : 'Hi, I was browsing ' + storeLabel;
    var suffix = intent === 'suggest'
      ? ' and wanted a suggestion.'
      : intent === 'size'
        ? ' and had a sizing question.'
        : ' and wanted some help.';
    return subject + suffix;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. POPUP UI
  // Scoped CSS injected once; HTML injected into #cw-root.
  // All class names prefixed with "cw-" to minimise theme conflicts.
  // ─────────────────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('cw-styles')) return;
    var css = [
      '#cw-root *{box-sizing:border-box;}',
      '#cw-overlay{position:fixed;inset:0;background:rgba(20,18,14,.42);display:none;align-items:flex-end;justify-content:center;z-index:2147483647;}',
      '#cw-overlay.cw-show{display:flex;animation:cwFadeIn .2s ease;}',
      '@keyframes cwFadeIn{from{opacity:0}to{opacity:1}}',
      '.cw-card{width:100%;max-width:480px;background:#fff;border-radius:20px 20px 0 0;padding:26px 22px 28px;transform:translateY(100%);animation:cwSlideUp .32s cubic-bezier(.16,1,.3,1) forwards;box-shadow:0 -8px 40px rgba(0,0,0,.18);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}',
      '@keyframes cwSlideUp{to{transform:translateY(0)}}',
      '.cw-eyebrow{font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:700;margin-bottom:8px;}',
       '.cw-eyebrow.cw-exit{color:#145436;}',
       '.cw-eyebrow.cw-engagement{color:#6c4a2f;}',
      '.cw-title{font-size:18px;font-weight:600;line-height:1.4;margin:0 0 16px;letter-spacing:-.01em;color:#1a1a1a;}',
      '.cw-cart-list{margin-bottom:18px;}',
      '.cw-cart-item{display:flex;align-items:center;gap:12px;background:#faf8f5;border:1px solid #e4dfd8;border-radius:10px;padding:9px 12px;margin-bottom:8px;}',
      '.cw-thumb{width:38px;height:38px;border-radius:6px;flex-shrink:0;object-fit:cover;background:#e4dfd8;}',
      '.cw-thumb-placeholder{width:38px;height:38px;border-radius:6px;flex-shrink:0;background:linear-gradient(135deg,#d9cfc0,#a4917a);}',
      '.cw-item-text{font-size:12.5px;line-height:1.4;color:#1a1a1a;}',
      '.cw-item-text strong{display:block;font-size:13px;}',
      '.cw-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:15px;background:#1f7a4d;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer;margin-bottom:0;}',
       '.cw-options{display:grid;gap:9px;margin-bottom:14px;}',
       '.cw-option{width:100%;padding:13px 14px;background:#faf8f5;border:1px solid #d8cfc4;border-radius:10px;color:#2a2723;font-size:14px;font-weight:600;text-align:left;cursor:pointer;}',
       '.cw-option:hover{border-color:#1f7a4d;background:#f4f8f4;}',
       '.cw-sms-link{display:block;margin:12px auto 0;color:#49678d;background:none;border:0;font-size:12px;text-decoration:underline;cursor:pointer;}',
      '.cw-btn-icon{width:20px;height:20px;flex-shrink:0;}',
      '.cw-dismiss{display:block;text-align:center;margin-top:14px;font-size:13px;color:#7a7368;background:none;border:none;cursor:pointer;width:100%;padding:6px;}',
      '.cw-consent{font-size:11px;color:#7a7368;text-align:center;margin-top:14px;line-height:1.5;}',
    ].join('');
    var style = document.createElement('style');
    style.id = 'cw-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  var WA_ICON = '<svg class="cw-btn-icon" viewBox="0 0 24 24" fill="white"><path d="M17.6 6.32A7.85 7.85 0 0012.05 4a7.94 7.94 0 00-6.87 11.88L4 20l4.24-1.11a7.9 7.9 0 003.8.97h.01a7.94 7.94 0 007.94-7.94 7.9 7.9 0 00-2.4-5.6zm-5.55 12.2h-.01a6.6 6.6 0 01-3.36-.92l-.24-.14-2.5.66.67-2.44-.16-.25a6.6 6.6 0 01-1.01-3.5 6.62 6.62 0 0111.24-4.7 6.58 6.58 0 011.94 4.7 6.62 6.62 0 01-6.57 6.6zm3.6-4.95c-.2-.1-1.17-.58-1.35-.64-.18-.07-.31-.1-.44.1-.13.19-.5.64-.62.78-.11.13-.23.15-.42.05-.2-.1-.83-.3-1.58-.97-.58-.52-.98-1.16-1.09-1.36-.11-.19 0-.3.09-.4.09-.09.2-.23.3-.35.1-.11.13-.19.2-.32.06-.13.03-.24-.02-.34-.05-.1-.44-1.05-.6-1.44-.16-.38-.32-.33-.44-.33-.11 0-.24-.01-.37-.01a.71.71 0 00-.52.24c-.18.19-.68.66-.68 1.6 0 .95.7 1.87.79 2 .1.13 1.36 2.08 3.3 2.91.46.2.82.32 1.1.4.46.15.88.13 1.21.08.37-.05 1.17-.48 1.33-.94.16-.46.16-.85.12-.94-.05-.09-.18-.14-.38-.24z"/></svg>';
  var SMS_ICON = '<svg class="cw-btn-icon" viewBox="0 0 24 24" fill="white"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>';

  function buildCartItemsHtml() {
    return cart.map(function (item) {
      var thumb = item.imageUrl
        ? '<img class="cw-thumb" src="' + item.imageUrl + '" alt="" loading="lazy">'
        : '<div class="cw-thumb-placeholder"></div>';
      var variant = item.variantTitle ? ' &middot; ' + item.variantTitle : '';
      var qty = item.qty > 1 ? ' &times;' + item.qty : '';
      return '<div class="cw-cart-item">' + thumb +
        '<div class="cw-item-text"><strong>' + item.name + '</strong>' +
        item.price + qty + variant + '</div></div>';
    }).join('');
  }

  function injectRoot() {
    if (document.getElementById('cw-root')) return;
    var root = document.createElement('div');
    root.id = 'cw-root';
    root.innerHTML =
      '<div id="cw-overlay">' +
        '<div class="cw-card">' +
          '<div class="cw-eyebrow" id="cw-eyebrow">Before you go</div>' +
          '<p class="cw-title" id="cw-title"></p>' +
          '<div class="cw-cart-list" id="cw-cart-list"></div>' +
          '<div class="cw-options" id="cw-options" style="display:none;"></div>' +
          '<a href="#" id="cw-wa-link" class="cw-btn">' + WA_ICON + 'Continue on WhatsApp</a>' +
          '<a href="#" id="cw-sms-link" class="cw-sms-link" style="display:none;">Prefer SMS?</a>' +
          '<button class="cw-dismiss" id="cw-dismiss">Not now, I\'ll browse</button>' +
          '<p class="cw-consent" id="cw-consent">Tapping "Continue on WhatsApp" opens a chat with this message pre-filled.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    // Dismiss button
    document.getElementById('cw-dismiss').addEventListener('click', function () {
      closeWidget();
    });

    // Click on backdrop to dismiss
    document.getElementById('cw-overlay').addEventListener('click', function (e) {
      if (e.target.id === 'cw-overlay') {
        closeWidget();
      }
    });

    document.getElementById('cw-options').addEventListener('click', function (e) {
      var option = e.target.getAttribute('data-intent');
      if (!option) return;
      selectedIntent = option;
      document.getElementById('cw-options').style.display = 'none';
      document.getElementById('cw-eyebrow').textContent = 'WhatsApp support';
      document.getElementById('cw-title').textContent = 'Continue to chat with our expert';
      document.getElementById('cw-wa-link').style.display = 'flex';
      document.getElementById('cw-consent').textContent =
        'Your choice will be included in the WhatsApp message.';
      updateMessageLinks();
    });

    // WhatsApp link
    document.getElementById('cw-wa-link').addEventListener('click', function () {
      converted = true;
      postCapture('whatsapp');
    });

    // SMS link
    document.getElementById('cw-sms-link').addEventListener('click', function () {
      converted = true;
      postCapture('sms');
    });
  }

  function updateMessageLinks() {
    var overlay = document.getElementById('cw-overlay');
    var smsLink = document.getElementById('cw-sms-link');
    var waLink  = document.getElementById('cw-wa-link');
    var waNumber  = (config && config.whatsapp_number) || '';
    var smsNumber = (config && config.sms_number) || '';
    var message = activeTrigger === 'exit'
      ? buildExitMessage()
      : buildEngagementMessage(selectedIntent);
    waLink.href = 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(message);
    if (activeTrigger === 'engagement' && !selectedIntent) {
      waLink.style.display = 'none';
      smsLink.style.display = 'none';
      return;
    }
    if (smsNumber) {
      smsLink.href = 'sms:' + smsNumber + '?body=' + encodeURIComponent(message);
      smsLink.style.display = 'block';
    } else {
      smsLink.style.display = 'none';
    }
  }

  function openWidget(trigger) {
    var overlay = document.getElementById('cw-overlay');
    var eyebrow = document.getElementById('cw-eyebrow');
    var title = document.getElementById('cw-title');
    var options = document.getElementById('cw-options');
    var waLink = document.getElementById('cw-wa-link');
    var smsLink = document.getElementById('cw-sms-link');

    activeTrigger = trigger;
    selectedIntent = trigger === 'exit' ? 'help' : null;
    if (trigger === 'exit') {
      eyebrow.textContent = 'Before you go';
      eyebrow.className = 'cw-eyebrow cw-exit';
      title.textContent = cart.length
        ? 'Continue on WhatsApp and we\'ll help with your cart.'
        : 'Need help finding something?';
      options.style.display = 'none';
      waLink.style.display = 'flex';
      document.getElementById('cw-consent').textContent =
        'Tapping "Continue on WhatsApp" opens a chat with this message pre-filled.';
    } else {
      var category = engagementContext && engagementContext.category;
      var persona = (config && config.persona_name) || 'Rohan';
      var cartCount = getCartCount(cartRaw, cart);
      eyebrow.className = 'cw-eyebrow cw-engagement';
      eyebrow.textContent = 'Here to help';
      title.textContent = engagementReason === 'cart_threshold'
        ? 'Hi, I\'m ' + persona + '. You have added ' + cartCount +
          ' ' + (cartCount === 1 ? 'product' : 'products') +
          ' to your cart. Can I help you with anything?'
        : 'Hi, I\'m ' + persona + '. Can I help you with anything?';
      options.innerHTML = category
        ? '<button class="cw-option" data-intent="suggest">Suggest something</button>' +
          '<button class="cw-option" data-intent="size">Size help</button>'
        : '<button class="cw-option" data-intent="suggest">Suggest something for me</button>' +
          '<button class="cw-option" data-intent="size">Size help</button>' +
          '<button class="cw-option" data-intent="other">Something else</button>';
      options.style.display = 'grid';
      waLink.style.display = 'none';
      smsLink.style.display = 'none';
      document.getElementById('cw-consent').textContent =
        'Choose one option and we\'ll open WhatsApp with the context pre-filled.';
    }

    updateMessageLinks();
    document.getElementById('cw-cart-list').innerHTML = buildCartItemsHtml();
    overlay.classList.add('cw-show');
  }

  function closeWidget() {
    var overlay = document.getElementById('cw-overlay');
    if (overlay) overlay.classList.remove('cw-show');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. CAPTURE LOGGING
  // Posts to POST /api/captures on WhatsApp or SMS click.
  // cart_snapshot is the raw /cart.js response at time of conversion.
  // ─────────────────────────────────────────────────────────────────────────────

  function postCapture(channel) {
    var tier = activeTrigger === 'engagement' ? 2 : 1;
    var snapshot;
    if (cartRaw && Array.isArray(cartRaw.items)) {
      snapshot = {
        item_count: cartRaw.item_count,
        total_price: cartRaw.total_price,
        items: cartRaw.items,
        price_unit: cartPriceUnit,
      };
    } else if (Array.isArray(cartRaw)) {
      snapshot = {
        item_count: cart.length,
        items: cartRaw,
        price_unit: cartPriceUnit,
      };
    } else {
      snapshot = { items: cart, price_unit: cartPriceUnit };
    }

    fetch(API_BASE + '/captures', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        store_id:      storeId,
        tier:          tier,
        channel:       channel,
        cart_snapshot: snapshot,
      }),
    }).catch(function () { /* non-fatal */ });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. INIT
  // ─────────────────────────────────────────────────────────────────────────────

  function init() {
    injectStyles();
    injectRoot();
    initLeaveSignals();
    initCartListener(onCartItemAdded);
    initEngagementDwell();
  }

  fetchConfig(function () {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  });

})();
