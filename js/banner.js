/**
 * Fake CMP / cookie banner wired to Impact Consent Mode (update on interaction).
 */
(function () {
  "use strict";

  function $(sel) {
    return document.querySelector(sel);
  }

  function renderBanner() {
    if ($("#impact-cookie-banner")) return;

    var el = document.createElement("div");
    el.id = "impact-cookie-banner";
    el.className = "cookie-banner";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-labelledby", "cookie-banner-title");
    el.setAttribute("aria-live", "polite");
    el.innerHTML =
      '<div class="cookie-banner__inner">' +
      '<div class="cookie-banner__copy">' +
      '<p id="cookie-banner-title" class="cookie-banner__title">We use cookies for tracking</p>' +
      "<p>This demo CMP controls Impact Consent Mode. Accept grants tracking; Reject denies it. " +
      "Choice is stored so later page loads use the correct <code>consent default</code>.</p>" +
      "</div>" +
      '<div class="cookie-banner__actions">' +
      '<button type="button" class="btn btn--ghost" data-consent="denied">Reject</button>' +
      '<button type="button" class="btn btn--primary" data-consent="granted">Accept</button>' +
      "</div>" +
      "</div>";
    document.body.appendChild(el);

    el.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-consent]");
      if (!btn) return;
      var status = btn.getAttribute("data-consent");
      window.ImpactConsent.updateConsent(status);
      hideBanner();
    });
  }

  function hideBanner() {
    var el = $("#impact-cookie-banner");
    if (el) el.classList.add("cookie-banner--hidden");
  }

  function showBanner() {
    renderBanner();
    var el = $("#impact-cookie-banner");
    if (el) el.classList.remove("cookie-banner--hidden");
  }

  function showBannerIfNeeded() {
    var stored = window.ImpactConsent.getStoredConsent();
    if (stored === "granted" || stored === "denied") {
      hideBanner();
      return false;
    }
    showBanner();
    return true;
  }

  window.ImpactConsent.showBannerIfNeeded = showBannerIfNeeded;
  window.ImpactConsent.openBanner = showBanner;
})();
