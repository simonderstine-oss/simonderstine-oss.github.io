/**
 * UI only: banner + inspector. Consent/identify already ran in <head>.
 */
(function () {
  "use strict";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function renderDebugPanel() {
    if ($("#impact-debug") || !document.body) return;
    var panel = document.createElement("aside");
    panel.id = "impact-debug";
    panel.className = "debug-panel";
    panel.innerHTML =
      '<header class="debug-panel__head">' +
      "<strong>Consent Mode Inspector</strong>" +
      '<button type="button" class="debug-panel__toggle" data-toggle>Hide</button>' +
      "</header>" +
      '<div class="debug-panel__body">' +
      '<dl class="debug-panel__meta">' +
      "<div><dt>Hostname</dt><dd data-k=\"host\">—</dd></div>" +
      "<div><dt>Head boot</dt><dd data-k=\"headboot\">—</dd></div>" +
      "<div><dt>UTT state (expected)</dt><dd data-k=\"state\">—</dd></div>" +
      "<div><dt>Demo consent store</dt><dd data-k=\"consent\">—</dd></div>" +
      "<div><dt>IR_PI (Impact)</dt><dd data-k=\"irpi\">—</dd></div>" +
      "<div><dt>All IR_* cookies</dt><dd data-k=\"ircookies\">—</dd></div>" +
      "<div><dt>demo_custom_profile_id</dt><dd data-k=\"profile\">—</dd></div>" +
      "<div><dt>demo_im_ref</dt><dd data-k=\"click\">—</dd></div>" +
      "<div><dt>customerId</dt><dd data-k=\"custid\">—</dd></div>" +
      "<div><dt>email (plain)</dt><dd data-k=\"email\">—</dd></div>" +
      "</dl>" +
      '<div class="debug-panel__actions">' +
      '<button type="button" class="btn btn--small" data-action="open-banner">Re-open banner</button>' +
      '<button type="button" class="btn btn--small" data-action="reset-consent">Reset consent</button>' +
      '<button type="button" class="btn btn--small" data-action="wipe">Wipe all + reload</button>' +
      '<button type="button" class="btn btn--small" data-action="login">Simulate login</button>' +
      '<button type="button" class="btn btn--small" data-action="logout">Simulate logout</button>' +
      "</div>" +
      '<p class="debug-panel__hint"><strong>Timing:</strong> consent+identify enqueue in <code>&lt;head&gt;</code> ' +
      "immediately after the UTT loader (before UTT JS finishes). " +
      "Network: <code>/xcc</code> INITIATED, <code>/bcc</code> DENIED, <code>/xur/</code> GRANTED. " +
      "Before Accept you should see <code>/xcc</code> and <em>no</em> new IR_PI.</p>" +
      '<ul class="debug-panel__log" data-log></ul>' +
      "</div>";
    document.body.appendChild(panel);

    panel.querySelector("[data-toggle]").addEventListener("click", function () {
      panel.classList.toggle("debug-panel--collapsed");
      this.textContent = panel.classList.contains("debug-panel--collapsed") ? "Show" : "Hide";
    });

    panel.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      if (action === "open-banner") window.ImpactConsent.openBanner();
      if (action === "reset-consent") {
        window.ImpactConsent.resetDemoState();
        window.ImpactConsent.showBannerIfNeeded();
        refreshMeta();
      }
      if (action === "wipe") {
        window.ImpactConsent.wipeAllDemoState();
        location.reload();
      }
      if (action === "login") {
        window.ImpactConsent.setCustomer("cust-1001", "shopper@example.com");
        location.reload();
      }
      if (action === "logout") {
        window.ImpactConsent.setCustomer("", "");
        location.reload();
      }
    });

    window.addEventListener("impact:log", function (e) {
      var list = panel.querySelector("[data-log]");
      var li = document.createElement("li");
      li.textContent = e.detail.message;
      list.insertBefore(li, list.firstChild);
      while (list.children.length > 40) list.removeChild(list.lastChild);
    });

    window.addEventListener("impact:consent-updated", refreshMeta);
    window.addEventListener("impact:consent-ready", refreshMeta);
  }

  function refreshMeta() {
    var panel = $("#impact-debug");
    if (!panel || !window.ImpactConsent) return;
    var c = window.ImpactConsent.getCustomer();
    var stored = window.ImpactConsent.getStoredConsent();
    var host = location.hostname;
    var siteOk = /(^|\.)simonderstine(-oss)?\.github\.io$/i.test(host);
    var headBoot = window.__IMPACT_CONSENT_HEAD_BOOT__;
    panel.querySelector('[data-k="headboot"]').textContent = headBoot
      ? "queued default=" + headBoot.tracking + " @ " + headBoot.at
      : "MISSING — consent may be too late";
    if (!headBoot) {
      panel.querySelector('[data-k="headboot"]').style.color = "#f0a8a0";
    }
    var stateLabel =
      stored === "granted"
        ? "GRANTED → expect /xur/ + IR_PI"
        : stored === "denied"
          ? "DENIED → expect /bcc, no IR_PI"
          : "INITIATED → expect /xcc (banner waiting)";
    panel.querySelector('[data-k="state"]').textContent = stateLabel;
    panel.querySelector('[data-k="consent"]').textContent =
      stored || "(none — consent default denied)";
    panel.querySelector('[data-k="irpi"]').textContent =
      window.ImpactConsent.getImpactIrPi() || "(none — should stay empty until Accept)";
    panel.querySelector('[data-k="ircookies"]').textContent =
      (window.ImpactConsent.listImpactCookies() || []).join(", ") || "(none)";
    panel.querySelector('[data-k="profile"]').textContent =
      window.ImpactConsent.getCustomProfileId() || "—";
    panel.querySelector('[data-k="click"]').textContent =
      window.ImpactConsent.getClickId() || "(none)";
    panel.querySelector('[data-k="custid"]').textContent = c.customerId || '""';
    panel.querySelector('[data-k="email"]').textContent = c.email || '""';

    var hostEl = panel.querySelector('[data-k="host"]');
    if (hostEl) {
      hostEl.textContent =
        host +
        (siteOk
          ? " ✓ matches expected Pages host"
          : " ✗ expect simonderstine-oss.github.io (and matching Impact site def)");
      hostEl.style.color = siteOk ? "#9fd9cb" : "#f0a8a0";
    }
  }

  function bootUi() {
    renderDebugPanel();
    if (window.ImpactConsent.showBannerIfNeeded) {
      window.ImpactConsent.showBannerIfNeeded();
    }
    refreshMeta();
    // Poll briefly so IR_* appearance after Accept is visible in the panel
    var n = 0;
    var timer = setInterval(function () {
      refreshMeta();
      if (++n > 20) clearInterval(timer);
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootUi);
  } else {
    bootUi();
  }
})();
