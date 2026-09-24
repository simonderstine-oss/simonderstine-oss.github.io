/**
 * Helpers + CMP update handlers.
 * consent default + identify are inlined in <head> immediately after the UTT loader
 * (see each HTML file) so they hit the ire stub queue before UTT JS initializes.
 */

(function (window, document) {
  "use strict";

  var CONSENT_STORAGE_KEY = "demo_consent_tracking";
  var PROFILE_COOKIE = "demo_custom_profile_id";
  var CLICK_ID_COOKIE = "demo_im_ref";
  var CUSTOMER_STORAGE_KEY = "demo_customer";
  var CLICK_ID_DAYS = 30;
  var PROFILE_DAYS = 365;
  var EVENT_ID_ONLINE_SALE = 70289;

  function log() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[Impact Consent]");
    console.log.apply(console, args);
    try {
      window.dispatchEvent(
        new CustomEvent("impact:log", { detail: { message: args.slice(1).join(" ") } })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function getCookie(name) {
    var match = document.cookie.match(
      new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)")
    );
    return match ? decodeURIComponent(match[1]) : "";
  }

  function setCookie(name, value, days) {
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      "; path=/; max-age=" +
      days * 24 * 60 * 60 +
      "; SameSite=Lax";
  }

  function uuidv4() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getCustomProfileId() {
    var id = getCookie(PROFILE_COOKIE);
    if (!id) {
      id = uuidv4();
      setCookie(PROFILE_COOKIE, id, PROFILE_DAYS);
    }
    return id;
  }

  function getStoredConsent() {
    try {
      return localStorage.getItem(CONSENT_STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function setStoredConsent(status) {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, status);
    } catch (e) {
      /* ignore */
    }
  }

  function clearStoredConsent() {
    try {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function getCustomer() {
    try {
      var raw = sessionStorage.getItem(CUSTOMER_STORAGE_KEY);
      return raw ? JSON.parse(raw) : { customerId: "", email: "" };
    } catch (e) {
      return { customerId: "", email: "" };
    }
  }

  function setCustomer(customerId, email) {
    sessionStorage.setItem(
      CUSTOMER_STORAGE_KEY,
      JSON.stringify({ customerId: customerId || "", email: email || "" })
    );
  }

  function sha1HexSync(message) {
    if (!message) return "";
    function rotl(n, s) {
      return (n << s) | (n >>> (32 - s));
    }
    function toHex(i) {
      return ("00000000" + (i >>> 0).toString(16)).slice(-8);
    }
    var utf8 = unescape(encodeURIComponent(message));
    var words = [];
    var i;
    for (i = 0; i < utf8.length; i++) {
      words[i >> 2] |= utf8.charCodeAt(i) << (24 - (i % 4) * 8);
    }
    var bitLen = utf8.length * 8;
    words[bitLen >> 5] |= 0x80 << (24 - (bitLen % 32));
    words[(((bitLen + 64) >>> 9) << 4) + 15] = bitLen;
    var h0 = 0x67452301;
    var h1 = 0xefcdab89;
    var h2 = 0x98badcfe;
    var h3 = 0x10325476;
    var h4 = 0xc3d2e1f0;
    var w = new Array(80);
    for (var block = 0; block < words.length; block += 16) {
      var a = h0,
        b = h1,
        c = h2,
        d = h3,
        e = h4;
      for (i = 0; i < 80; i++) {
        w[i] =
          i < 16
            ? words[block + i] | 0
            : rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
        var f,
          k;
        if (i < 20) {
          f = (b & c) | (~b & d);
          k = 0x5a827999;
        } else if (i < 40) {
          f = b ^ c ^ d;
          k = 0x6ed9eba1;
        } else if (i < 60) {
          f = (b & c) | (b & d) | (c & d);
          k = 0x8f1bbcdc;
        } else {
          f = b ^ c ^ d;
          k = 0xca62c1d6;
        }
        var temp = (rotl(a, 5) + f + e + k + w[i]) | 0;
        e = d;
        d = c;
        c = rotl(b, 30);
        b = a;
        a = temp;
      }
      h0 = (h0 + a) | 0;
      h1 = (h1 + b) | 0;
      h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0;
    }
    return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4);
  }

  function ensureIre() {
    if (typeof window.ire !== "function") {
      console.error("[Impact Consent] ire() missing");
      return false;
    }
    return true;
  }

  function updateConsent(tracking) {
    if (!ensureIre()) return;
    if (tracking !== "granted" && tracking !== "denied") {
      throw new Error("tracking must be 'granted' or 'denied'");
    }
    setStoredConsent(tracking);
    window.ire("consent", "update", { tracking: tracking });
    log("consent update →", tracking);
    try {
      window.dispatchEvent(
        new CustomEvent("impact:consent-updated", { detail: { tracking: tracking } })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function trackOnlineSale(order) {
    if (!ensureIre()) return null;
    var stored = getStoredConsent();
    var tracking = stored === "granted" ? "granted" : "denied";
    var customer = getCustomer();
    var emailHash = sha1HexSync(customer.email);
    var clickId = getCookie(CLICK_ID_COOKIE) || "";

    window.ire("consent", "default", { tracking: tracking });
    log("conversion consent default →", tracking);

    var props = {
      orderId: order.orderId,
      customProfileId: getCustomProfileId(),
      customerId: customer.customerId || "",
      customerEmail: emailHash || "",
      customerStatus: order.customerStatus || "New",
      currencyCode: order.currencyCode || "USD",
      orderPromoCode: order.orderPromoCode || "",
      orderDiscount: Number(order.orderDiscount) || 0,
      items: order.items || [],
    };
    if (clickId) props.clickid = clickId;

    window.ire("trackConversion", EVENT_ID_ONLINE_SALE, props, {
      verifySiteDefinitionMatch: true,
    });
    log("trackConversion", EVENT_ID_ONLINE_SALE, JSON.stringify(props));
    return props;
  }

  function getImpactIrPi() {
    return getCookie("IR_PI") || "";
  }

  function listImpactCookies() {
    return (document.cookie || "")
      .split(";")
      .map(function (c) {
        return c.trim().split("=")[0];
      })
      .filter(function (n) {
        return n && /^IR_/i.test(n);
      });
  }

  function wipeAllDemoState() {
    clearStoredConsent();
    setCookie(PROFILE_COOKIE, "", -1);
    setCookie(CLICK_ID_COOKIE, "", -1);
    ["IR_PI", "IR_gbd"].forEach(function (name) {
      document.cookie = name + "=; path=/; max-age=0; SameSite=Lax";
    });
    try {
      sessionStorage.removeItem(CUSTOMER_STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
    log("Wiped demo state + attempted IR_* clear");
  }

  window.ImpactConsent = {
    EVENT_ID_ONLINE_SALE: EVENT_ID_ONLINE_SALE,
    updateConsent: updateConsent,
    trackOnlineSale: trackOnlineSale,
    getStoredConsent: getStoredConsent,
    getCustomProfileId: getCustomProfileId,
    getClickId: function () {
      return getCookie(CLICK_ID_COOKIE) || "";
    },
    getImpactIrPi: getImpactIrPi,
    listImpactCookies: listImpactCookies,
    getCustomer: getCustomer,
    setCustomer: setCustomer,
    resetDemoState: function () {
      clearStoredConsent();
      log("Cleared stored consent preference");
    },
    wipeAllDemoState: wipeAllDemoState,
    showBannerIfNeeded: null,
    openBanner: null,
    /** True when head inline boot already queued consent+identify */
    headBooted: !!(window.__IMPACT_CONSENT_HEAD_BOOT__),
  };
})(window, document);
