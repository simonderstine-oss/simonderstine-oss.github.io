/**
 * Impact Consent Mode — reference implementation
 * Matches TIP "49266 - Simon Demo" + Integrate Consent Mode on impact.com
 *
 * Order of operations (critical):
 * 1. Load UTT in <head>
 * 2. On body: ire('consent','default',…) THEN ire('identify',…)
 * 3. On CMP interaction: ire('consent','update',…)
 */

(function (window, document) {
  "use strict";

  // Demo-only storage (NOT Impact platform cookies). Impact writes IR_PI only when GRANTED.
  var CONSENT_STORAGE_KEY = "demo_consent_tracking";
  var PROFILE_COOKIE = "demo_custom_profile_id";
  var CLICK_ID_COOKIE = "demo_im_ref";
  var CUSTOMER_STORAGE_KEY = "demo_customer";
  // Referral window stand-in (days) — align with Template Terms in production
  var CLICK_ID_DAYS = 30;
  var PROFILE_DAYS = 365;

  var EVENT_ID_ONLINE_SALE = 70289;

  function log() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift("[Impact Consent]");
    console.log.apply(console, args);
    window.dispatchEvent(
      new CustomEvent("impact:log", { detail: { message: args.slice(1).join(" ") } })
    );
  }

  function getCookie(name) {
    var match = document.cookie.match(
      new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)")
    );
    return match ? decodeURIComponent(match[1]) : "";
  }

  function setCookie(name, value, days) {
    var maxAge = days * 24 * 60 * 60;
    // SameSite=Lax first-party cookie; HttpOnly requires a server — noted in debug panel
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      "; path=/; max-age=" +
      maxAge +
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
      log("Created customProfileId:", id);
    }
    return id;
  }

  function captureClickIdFromUrl() {
    // TIP Appendix: do not strip im_ref until after UTT loads + consent default/identify.
    // We read and store it; we never remove it from the URL here.
    var params = new URLSearchParams(window.location.search);
    var imRef = params.get("im_ref");
    if (imRef) {
      setCookie(CLICK_ID_COOKIE, imRef, CLICK_ID_DAYS);
      log("Captured im_ref (click id):", imRef);
    }
    return getCookie(CLICK_ID_COOKIE) || "";
  }

  function getStoredConsent() {
    try {
      return localStorage.getItem(CONSENT_STORAGE_KEY); // 'granted' | 'denied' | null
    } catch (e) {
      return null;
    }
  }

  function setStoredConsent(status) {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, status);
    } catch (e) {
      /* ignore quota / private mode */
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

  function sha1Hex(message) {
    if (!message) return Promise.resolve("");
    var encoder = new TextEncoder();
    return crypto.subtle.digest("SHA-1", encoder.encode(message)).then(function (buf) {
      return Array.from(new Uint8Array(buf))
        .map(function (b) {
          return b.toString(16).padStart(2, "0");
        })
        .join("");
    });
  }

  function ensureIre() {
    if (typeof window.ire !== "function") {
      console.error(
        "[Impact Consent] ire() is not defined. UTT must load in <head> before this script."
      );
      return false;
    }
    return true;
  }

  /**
   * Page-load consent default + identify (TIP pages 4–5).
   * Returning users who already granted → default granted.
   * New / undecided users → default denied.
   */
  var initPromise = null;

  function initConsentAndIdentify() {
    if (initPromise) return initPromise;

    initPromise = (function () {
      if (!ensureIre()) return Promise.resolve(null);

      captureClickIdFromUrl();
      var customProfileId = getCustomProfileId();
      var stored = getStoredConsent();
      var defaultTracking = stored === "granted" ? "granted" : "denied";

      log(
        "consent default →",
        defaultTracking,
        stored ? "(from prior CMP choice)" : "(new / undecided)"
      );

      // CRITICAL: consent BEFORE identify
      window.ire("consent", "default", { tracking: defaultTracking });

      var customer = getCustomer();
      return sha1Hex(customer.email).then(function (emailHash) {
        var identifyPayload = {
          customerId: customer.customerId || "",
          customerEmail: emailHash || "",
          customProfileId: customProfileId,
        };
        window.ire("identify", identifyPayload);
        log("identify →", JSON.stringify(identifyPayload));
        window.dispatchEvent(
          new CustomEvent("impact:consent-ready", {
            detail: { defaultTracking: defaultTracking, stored: stored },
          })
        );
        return { defaultTracking: defaultTracking, stored: stored };
      });
    })();

    return initPromise;
  }

  function updateConsent(tracking) {
    if (!ensureIre()) return;
    if (tracking !== "granted" && tracking !== "denied") {
      throw new Error("tracking must be 'granted' or 'denied'");
    }
    setStoredConsent(tracking);
    window.ire("consent", "update", { tracking: tracking });
    log("consent update →", tracking);
    window.dispatchEvent(
      new CustomEvent("impact:consent-updated", { detail: { tracking: tracking } })
    );
  }

  /**
   * Confirmation page: consent default reflecting current status, then trackConversion.
   */
  function trackOnlineSale(order) {
    if (!ensureIre()) return Promise.resolve();

    var stored = getStoredConsent();
    var tracking = stored === "granted" ? "granted" : "denied";
    var customProfileId = getCustomProfileId();
    var clickId = getCookie(CLICK_ID_COOKIE) || "";
    var customer = getCustomer();

    return sha1Hex(customer.email).then(function (emailHash) {
      window.ire("consent", "default", { tracking: tracking });
      log("conversion page consent default →", tracking);

      var props = {
        orderId: order.orderId,
        customProfileId: customProfileId,
        customerId: customer.customerId || "",
        customerEmail: emailHash || "",
        customerStatus: order.customerStatus || "New",
        currencyCode: order.currencyCode || "USD",
        orderPromoCode: order.orderPromoCode || "",
        orderDiscount: Number(order.orderDiscount) || 0,
        items: order.items || [],
      };

      // TIP Appendix: pass click id when captured (JS variable clickid)
      if (clickId) {
        props.clickid = clickId;
      }

      window.ire("trackConversion", EVENT_ID_ONLINE_SALE, props, {
        verifySiteDefinitionMatch: true,
      });
      log("trackConversion", EVENT_ID_ONLINE_SALE, JSON.stringify(props));
      return props;
    });
  }

  function resetDemoState() {
    clearStoredConsent();
    // Keep profile id so returning-visitor tests stay realistic; expose full wipe separately
    log("Cleared stored consent preference (customProfileId retained)");
  }

  function getImpactIrPi() {
    return getCookie("IR_PI") || "";
  }

  function wipeAllDemoState() {
    clearStoredConsent();
    setCookie(PROFILE_COOKIE, "", -1);
    setCookie(CLICK_ID_COOKIE, "", -1);
    // Also clear legacy cookie names from earlier demo builds
    setCookie("impact_custom_profile_id", "", -1);
    setCookie("impact_im_ref", "", -1);
    try {
      localStorage.removeItem("impact_consent_tracking");
      sessionStorage.removeItem(CUSTOMER_STORAGE_KEY);
      sessionStorage.removeItem("impact_demo_customer");
    } catch (e) {
      /* ignore */
    }
    log("Wiped demo consent/profile/click id/customer (IR_PI is owned by UTT)");
  }

  window.ImpactConsent = {
    EVENT_ID_ONLINE_SALE: EVENT_ID_ONLINE_SALE,
    initConsentAndIdentify: initConsentAndIdentify,
    updateConsent: updateConsent,
    trackOnlineSale: trackOnlineSale,
    getStoredConsent: getStoredConsent,
    getCustomProfileId: getCustomProfileId,
    getClickId: function () {
      return getCookie(CLICK_ID_COOKIE) || "";
    },
    getImpactIrPi: getImpactIrPi,
    getCustomer: getCustomer,
    setCustomer: setCustomer,
    sha1Hex: sha1Hex,
    resetDemoState: resetDemoState,
    wipeAllDemoState: wipeAllDemoState,
    showBannerIfNeeded: null, // set by banner.js
  };
})(window, document);
