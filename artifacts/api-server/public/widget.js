/**
 * Cart-to-WhatsApp Widget
 * =======================
 * Drop-in script for Shopify themes. Reads config from the API, listens for
 * real Shopify cart events, and fires tiered nudge popups on WhatsApp/SMS.
 *
 * Usage:
 *   <script src="https://yourapp.com/widget.js" data-store="{store_id}" defer></script>
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
      var tags = document.querySelectorAll('script[data-store]');
      return tags[tags.length - 1]; // last matching tag if currentScript is unavailable
    })();

  var storeId = script && script.getAttribute('data-store');
  if (!storeId) {
    // Fail silently — don't break the merchant's storefront
    return;
  }

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
  // 3. HOOKS — three-tier matching
  //
  // Tier A: Exact match on product_type
  // Tier B: Normalized substring match (lowercase, strip hyphens/spaces)
  //         Maps common keywords to the closest HOOKS key
  // Tier C: Generic fallback — never a blank/broken popup
  // ─────────────────────────────────────────────────────────────────────────────

  var HOOKS = {
    'Oversized T-Shirt': "Want to make sure you pick the perfect oversized fit? We'll recommend your ideal size and matching bottoms.",
    'Graphic T-Shirt':   "We'll recommend bottoms and layering pieces that match this graphic.",
    'Shirt':             "We'll help you choose the right fit and suggest trousers or jeans that complement this shirt.",
    'Linen Shirt':       "We'll recommend the best fit and create a complete summer outfit around this linen shirt.",
    'Jeans':             "Need help choosing the right waist and fit? We'll also suggest tops that pair well with these jeans.",
    'Cargo Pants':       "We'll help you pick the right fit and recommend oversized tees or shirts that complete the look.",
    'Hoodie':            "We'll recommend the perfect size and matching joggers or cargos.",
    'Jacket':            "We'll suggest the best layering pieces and help you choose the right size.",
    'Co-ord Set':        "We'll help you choose the perfect fit and recommend accessories to complete the look.",
    'Shorts':            "We'll recommend matching tees or shirts and help you pick the best fit."
  };

  // Keyword → HOOKS key map for normalized matching
  var KEYWORD_MAP = [
    ['oversized',    'Oversized T-Shirt'],
    ['graphic',      'Graphic T-Shirt'],
    ['linen',        'Linen Shirt'],
    ['tshirt',       'Oversized T-Shirt'],   // t-shirt, tee, tshirts → default oversized hook
    ['tee',          'Graphic T-Shirt'],
    ['shirt',        'Shirt'],
    ['jean',         'Jeans'],
    ['denim',        'Jeans'],
    ['cargo',        'Cargo Pants'],
    ['pant',         'Cargo Pants'],
    ['trouser',      'Jeans'],
    ['hoodie',       'Hoodie'],
    ['sweat',        'Hoodie'],
    ['jacket',       'Jacket'],
    ['blazer',       'Jacket'],
    ['overshirt',    'Jacket'],
    ['coord',        'Co-ord Set'],
    ['co-ord',       'Co-ord Set'],
    ['set',          'Co-ord Set'],
    ['short',        'Shorts'],
  ];

  var GENERIC_HOOK = "We'll help you find the perfect fit for this piece.";

  function resolveHook(productType, title) {
    // Tier A: exact match
    if (HOOKS[productType]) return HOOKS[productType];

    // Tier B: normalized substring match against both product_type and title
    var haystack = ((productType || '') + ' ' + (title || ''))
      .toLowerCase()
      .replace(/[\s\-_]+/g, '');

    for (var i = 0; i < KEYWORD_MAP.length; i++) {
      var keyword = KEYWORD_MAP[i][0].replace(/[\s\-_]+/g, '');
      var hooksKey = KEYWORD_MAP[i][1];
      if (haystack.indexOf(keyword) !== -1) return HOOKS[hooksKey];
    }

    // Tier C: generic fallback
    return GENERIC_HOOK;
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

    function syncCart() {
      if (fetchInFlight) return;
      fetchInFlight = true;
      fetch('/cart.js', { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (shopifyCart) {
          fetchInFlight = false;
          if (shopifyCart.item_count > lastKnownCount) {
            lastKnownCount = shopifyCart.item_count;
            onCartItemAdded(normaliseCart(shopifyCart), shopifyCart);
          } else {
            lastKnownCount = shopifyCart.item_count;
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
    fetch('/cart.js', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (c) { lastKnownCount = c.item_count; })
      .catch(function () {});
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. SESSION STATE & TIER LOGIC
  // Ported exactly from cart-whatsapp-widget-tiered-demo.html
  // ─────────────────────────────────────────────────────────────────────────────

  var cart = [];           // normalised items (our format)
  var cartRaw = null;      // raw Shopify /cart.js snapshot (for capture POST)
  var idleTimer = null;
  var tier1Shown = false;
  var tier1Dismissed = false;
  var tier2Shown = false;
  var converted = false;

  var IDLE_MS = 50000; // 50s — midpoint of 45-60s range; adjust per merchant if needed

  function onCartItemAdded(normalisedItems, shopifyCart) {
    cart = normalisedItems;
    cartRaw = shopifyCart;

    if (converted) return;

    if (!tier1Shown) {
      // (Re)start the idle countdown. Restart if cart grows before it fires.
      clearTimeout(idleTimer);
      idleTimer = setTimeout(fireTier1, IDLE_MS);
    }
    // If Tier 1 already shown/dismissed, do nothing — leave signals handle Tier 2
  }

  function fireTier1() {
    if (tier1Shown || converted || cart.length === 0) return;
    tier1Shown = true;
    openWidget(1);
  }

  function fireTier2() {
    if (!tier1Dismissed || tier2Shown || converted || cart.length === 0) return;
    tier2Shown = true;
    openWidget(2);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. LEAVE-SIGNAL DETECTION
  // Ported exactly from the demo.
  // ─────────────────────────────────────────────────────────────────────────────

  function initLeaveSignals() {
    // Tab / app switch
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) fireTier2();
    });

    // Mouse leaving toward the tab bar (desktop only)
    document.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget && e.clientY <= 0) fireTier2();
    });

    // Back button / back-swipe: push a trap history entry so the first
    // "back" action fires popstate instead of actually navigating away.
    try {
      history.pushState({ _cwTrap: true }, '', location.href);
    } catch (_) {}

    window.addEventListener('popstate', function () {
      var shouldIntercept = tier1Dismissed && !tier2Shown && !converted && cart.length > 0;
      if (shouldIntercept) {
        fireTier2();
        try { history.pushState({ _cwTrap: true }, '', location.href); } catch (_) {}
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. MESSAGE GENERATION
  // Ported from demo; now uses config values and the three-tier HOOKS resolver.
  // ─────────────────────────────────────────────────────────────────────────────

  function hookForCart() {
    if (!config) return GENERIC_HOOK;

    if (config.mode === 'discount') {
      var amt = (config.currency || '₹') + (config.discount_amount || '');
      return cart.length === 1
        ? 'This one\'s just for you \u2014 ' + amt + ' off, reserved on WhatsApp.'
        : 'Sirf iss order ke liye \u2014 ' + amt + ' off, reserved on WhatsApp. Continue karo isse pehle ye chala jaaye.';
    }

    // personalized mode
    if (cart.length === 1) {
      return resolveHook(cart[0].type, cart[0].name);
    }

    // Multi-item: build a "you're building a full look" message
    var shortNames = cart.map(function (item) {
      return item.name.split(' ').slice(-1)[0];
    }).join(' + ');
    return 'You\'re building a full look (' + shortNames + ') \u2014 want us to suggest one more piece to complete it, and confirm sizing for everything?';
  }

  function buildMessageText(prefix) {
    var itemList = cart.map(function (item) {
      return item.name + ' (' + item.price + ')';
    }).join(', ');

    if (config && config.mode === 'discount') {
      return prefix + ' I have ' + (cart.length > 1 ? 'these items' : 'this item') +
        ' in my cart: ' + itemList + '. Claiming my reserved discount.';
    }
    return prefix + ' I have ' + (cart.length > 1 ? 'these items' : 'this item') +
      ' in my cart: ' + itemList + '. ' + hookForCart();
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
      '.cw-eyebrow.cw-tier1{color:#145436;}',
      '.cw-eyebrow.cw-tier2{color:#b23a2e;}',
      '.cw-title{font-size:18px;font-weight:600;line-height:1.4;margin:0 0 16px;letter-spacing:-.01em;color:#1a1a1a;}',
      '.cw-cart-list{margin-bottom:18px;}',
      '.cw-cart-item{display:flex;align-items:center;gap:12px;background:#faf8f5;border:1px solid #e4dfd8;border-radius:10px;padding:9px 12px;margin-bottom:8px;}',
      '.cw-thumb{width:38px;height:38px;border-radius:6px;flex-shrink:0;object-fit:cover;background:#e4dfd8;}',
      '.cw-thumb-placeholder{width:38px;height:38px;border-radius:6px;flex-shrink:0;background:linear-gradient(135deg,#d9cfc0,#a4917a);}',
      '.cw-item-text{font-size:12.5px;line-height:1.4;color:#1a1a1a;}',
      '.cw-item-text strong{display:block;font-size:13px;}',
      '.cw-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:15px;background:#1f7a4d;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;cursor:pointer;margin-bottom:0;}',
      '#cw-overlay.cw-tier2 .cw-btn{background:#b23a2e;}',
      '.cw-btn-sms{background:#2b5faa!important;margin-top:9px;}',
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
          '<a href="#" id="cw-wa-link" class="cw-btn">' + WA_ICON + 'Continue on WhatsApp</a>' +
          '<a href="#" id="cw-sms-link" class="cw-btn cw-btn-sms" style="display:none;">' + SMS_ICON + 'Continue via SMS instead</a>' +
          '<button class="cw-dismiss" id="cw-dismiss">Not now, I\'ll browse</button>' +
          '<p class="cw-consent" id="cw-consent">Tapping "Continue on WhatsApp" opens a chat with this message pre-filled.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);

    // Dismiss button
    document.getElementById('cw-dismiss').addEventListener('click', function () {
      closeWidget();
      if (tier1Shown && !tier1Dismissed && !tier2Shown) {
        tier1Dismissed = true;
      }
      // Tier 2 dismiss → stay silent (no state change needed; tier2Shown=true blocks refiring)
    });

    // Click on backdrop to dismiss
    document.getElementById('cw-overlay').addEventListener('click', function (e) {
      if (e.target.id === 'cw-overlay') {
        closeWidget();
        if (tier1Shown && !tier1Dismissed && !tier2Shown) tier1Dismissed = true;
      }
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

  function openWidget(tier) {
    var overlay = document.getElementById('cw-overlay');
    var eyebrow = document.getElementById('cw-eyebrow');
    var title   = document.getElementById('cw-title');
    var smsLink = document.getElementById('cw-sms-link');
    var waLink  = document.getElementById('cw-wa-link');

    overlay.classList.remove('cw-tier2');

    var waNumber  = (config && config.whatsapp_number) || '';
    var smsNumber = (config && config.sms_number) || '';

    if (tier === 1) {
      eyebrow.textContent = 'Before you go';
      eyebrow.className = 'cw-eyebrow cw-tier1';
      title.textContent = hookForCart();
      waLink.href = 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(buildMessageText('Hi!'));
      document.getElementById('cw-consent').textContent = 'Tapping "Continue on WhatsApp" opens a chat with this message pre-filled.';
    } else {
      eyebrow.textContent = 'Last thing before you leave';
      eyebrow.className = 'cw-eyebrow cw-tier2';
      overlay.classList.add('cw-tier2');
      title.textContent = 'Want us to hold your cart and send you the details on WhatsApp instead?';
      waLink.href = 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(buildMessageText('Hi, I was about to leave \u2014'));
      document.getElementById('cw-consent').textContent = "We'll just send your cart \u2014 no spam, stop anytime.";
    }

    // SMS button: show only if SMS number is configured
    if (smsNumber) {
      var smsBody = tier === 1
        ? buildMessageText('Hi!')
        : buildMessageText('Hi, I was about to leave \u2014');
      smsLink.href = 'sms:' + smsNumber + '?body=' + encodeURIComponent(smsBody);
      smsLink.style.display = 'flex';
    } else {
      smsLink.style.display = 'none';
    }

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
    var tier = tier2Shown ? 2 : 1;
    var snapshot = cartRaw
      ? { item_count: cartRaw.item_count, total_price: cartRaw.total_price, items: cartRaw.items }
      : { items: cart };

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
  }

  fetchConfig(function () {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  });

})();
