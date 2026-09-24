# Case Study: Impact Consent Mode — Gold-Standard Reference Implementation

**Program:** Simon Demo (49266)  
**Account:** Implementation Engineering Test Account (3318275)  
**Author context:** Integration Engineering enablement  
**Reference site:** https://simonderstine-oss.github.io  
**UTT:** `https://utt.impactcdn.com/A3318275-654b-4b94-bfb3-76b3e4e02aea1.js`  
**Conversion event:** Online Sale (`70289`)  
**Date:** September 2026  

---

## 1. Executive summary

We built a fake storefront with a cookie banner to implement Impact **Consent Mode** exactly as recommended in the Simon Demo Technical Implementation Plan (TIP) and Impact’s Consent Mode documentation. The goal was a **known-good reference** so Integration Engineering can compare client setups against correct behavior.

Early tests looked “broken” (Impact cookies before Accept, no obvious “consent” network call). After validating against the live UTT source and retesting with a real tracking link, we concluded:

1. **Consent Mode is implemented correctly** on the reference site when `consent` + `identify` are queued synchronously in `<head>` immediately after the UTT loader.
2. Several signals that look like failures are **expected UTT behavior** (`IR_gbd`, `IR_49266`, absence of a request named `consent`).
3. The **real pass/fail signals** are: no `IR_PI` and no Identify (`/xur` / beacon to program id) before Accept; after Accept, `IR_PI` appears and Identify fires.

This case study also documents the same failure mode we see with SPA/framework clients: delaying `ire('consent','default')` until after the UTT initializes.

---

## 2. Objective and context

### Business need

As an Integration Engineer, client Consent Mode reviews are hard without a baseline. Clients often:

- Fire `identify` before `consent`
- Wrap `ire()` in Angular/React lifecycle hooks (too late)
- Block the entire UTT until Accept (wrong pattern for Consent Mode)
- Misread DevTools (looking for a request named `consent`, or treating every `IR_*` cookie as non-compliant)

### Goal

Create a **minimal ecommerce demo** (home → cart → checkout → confirmation) that:

- Implements Consent Mode **as the TIP specifies**
- Uses a real CMP-like banner (Accept / Reject)
- Surfaces inspector tooling for cookies, head-boot timing, and expected states
- Is hosted on a URL that matches Impact **site definition** and **deep linking** (not localhost)

### Source of truth

| Source | Role |
|---|---|
| TIP: `49266 - Simon Demo` | Account-specific UTT, event id, domain, consent/identify/conversion snippets, test steps |
| [Integrate Consent Mode on impact.com](https://integrations.impact.com/integration-guides/for-brands/tracking-integrations/integrate-consent-mode-on-impact.com) | Official client-side Consent Mode pattern |
| Internal note: *Consent Mode (JS Integrations) — Understanding with Gemini* | UTT gatekeeper behavior (`GRANTED` / `DENIED` / `INITIATED`), `/xcc` vs `/bcc` vs `/xur/` |
| Live UTT JS (v3.7.x, build on account tag) | Definitive cookie names and network routing |

---

## 3. What we built

**Repo / Pages:** `simonderstine-oss/simonderstine-oss.github.io` → https://simonderstine-oss.github.io  

**Pages:** `index.html`, `cart.html`, `checkout.html`, `confirmation.html`  

**Core pattern (every page `<head>`):**

1. UTT loader stub (creates `window.ire` queue; loads UTT async)
2. **Inline** (same turn, no network gap):
   - `ire('consent', 'default', { tracking: 'denied' | 'granted' })`
   - `ire('identify', { customerId, customerEmail, customProfileId })`
3. Cookie banner later calls:
   - Accept → `ire('consent', 'update', { tracking: 'granted' })`
   - Reject → `ire('consent', 'update', { tracking: 'denied' })`
4. Confirmation page: `trackConversion` for event **70289** (with consent default reflecting stored preference)

**Supporting behavior:**

- Persist CMP choice in `localStorage` (`demo_consent_tracking`) so return visits default correctly
- `customProfileId` UUID cookie (`demo_custom_profile_id`)
- Capture/store `im_ref` (`demo_im_ref`); do not strip from URL
- On-page **Consent Mode Inspector**

**Impact platform config required for this host:**

- Site definition includes `simonderstine-oss.github.io` (in addition to TIP’s `simonderstine.github.io`)
- Deep linking permitted domains aligned with that host

---

## 4. Problems we hit (and what they taught us)

### 4.1 Localhost cannot validate Consent Mode for this program

UTT resolves the campaign from the **current hostname** against site definition.

Initially, program `49266` only matched `simonderstine.github.io`. On `127.0.0.1`, consent/identify campaign resolution fails and behavior looks wrong.

**Lesson:** Test Consent Mode on a URL that is in site definition + deep linking — never rely on localhost for this account’s gold standard.

### 4.2 Same failure mode as SPA clients: late `consent` / `identify`

First implementation ran consent+identify on `DOMContentLoaded` (and briefly via a separate script fetch). That allowed the async UTT to initialize first and set Impact cookies before Accept — **the same class of bug** as:

> Framework delays `setConsentDefault()` until after UTT has fully loaded and dropped session cookies. The `ire` queue must receive `consent` before the UTT library fully initializes.

**Fix:** Inline `consent` + `identify` immediately after the UTT loader in `<head>` (TIP “standard HTML top-to-bottom” sequence).

### 4.3 Misreading cookies as “Consent Mode broken”

Before Accept we observed:

- `IR_gbd`
- `IR_49266`

That looked non-compliant / broken. UTT source shows:

| Cookie | Meaning | Consent-gated? |
|---|---|---|
| `IR_gbd` | Base-domain probe for first-party cookie scoping | **No** — always |
| `IR_49266` | Campaign session cookie (`IR_` + program id). Written when `identify` matches the campaign (`z2r`) | **No** — can appear while INITIATED |
| `IR_PI` | Attribution / tracking cookie | **Yes** — only when **GRANTED** |

**Lesson:** `IR_gbd` / `IR_49266` before Accept are **expected**. `IR_PI` before Accept is the real red flag.

*Compliance nuance:* Impact Consent Mode is designed around gating attribution tracking / `IR_PI` / PII. Whether *any* cookie before consent is acceptable under ePrivacy for a given brand is a **legal** question — not answered solely by “UTT does this.”

### 4.4 Misreading Network: looking for a request named `consent`

`ire('consent', …)` does **not** create a Network entry named `consent`. It surfaces as analytics pings:

| Call | State | Typical Network shape |
|---|---|---|
| `consent` / `default` / `denied` | INITIATED | XHR → `…/xcc` (often `*.impct.site`) — **may be skipped** if UTT has no consent event to report |
| `consent` / `update` / `denied` | DENIED | Beacon → `…/bcc` |
| `consent` / `update` / `granted` | GRANTED | May ping tracking domain; then Identify flushes |
| `identify` (after grant) | GRANTED | `/xur/` / `/ur/` / `/cur/`, or Chrome **Type `ping`** whose **Name** is the program id (`49266`) |

Dummy `im_ref=1234567` often produces **no `/xcc`** (“no new consent events”). A real Test Actions / partner link is required for a fair `/xcc` check.

### 4.5 ggshield / deploy friction (process only)

Company Kandji-managed `ggshield` blocked the first commit until `--no-verify` was explicitly allowed. Unrelated to Consent Mode behavior; noted for future deploys.

---

## 5. Intended Consent Mode behavior (reference model)

From Impact docs + UTT gatekeeper model:

### Three states

| State | How you get there | Tracking | Typical ping |
|---|---|---|---|
| **INITIATED** | `consent default` denied / waiting on CMP | Identify/conversion **blocked**; PII not sent | `/xcc` (when emitted) |
| **DENIED** | User rejects CMP → `consent update` denied | Blocked; queued data cleared (except loyalty paths) | `/bcc` |
| **GRANTED** | User accepts → `consent update` granted (or default granted on return visit) | Full tracking; queued identify flushes | Identify `/xur` (etc.); `IR_PI` set |

### Critical ordering

```text
1. UTT loader stub in <head>          → creates ire() queue
2. ire('consent', 'default', …)       → MUST be next (sync)
3. ire('identify', …)                 → immediately after consent
4. Async UTT file finishes            → drains queue with consent already applied
5. CMP interaction                    → ire('consent', 'update', …)
```

If step 2–3 are deferred (DOM ready, React `useEffect`, GTM “Consent Initialization” firing too late, etc.), UTT may initialize with consent status still `null`. In that case the gatekeeper treats tracking as allowed (`null` ≈ can track), which matches broken client setups.

---

## 6. What we tested

### Environment

- Incognito / cleared site data
- Host: `https://simonderstine-oss.github.io`
- Entry via **real Impact tracking / test link** (landing URL contained real `im_ref=…`)
- DevTools → Network → **All** (not JS-only)
- On-page Consent Mode Inspector

### Scenarios

1. **Land, banner untouched (INITIATED)**  
2. **Accept**  
3. **Reject** (also validated in earlier passes)  
4. Cookie + Network interpretation vs TIP / internal guide  

---

## 7. What we found (observed results)

### 7.1 Before Accept (real tracking link)

| Signal | Observed | Assessment |
|---|---|---|
| Head boot | `queued default=denied` | Pass — consent+identify enqueued in head |
| Banner | Visible | Pass |
| `IR_PI` | None | **Pass** |
| `IR_gbd`, `IR_49266` | Present | Expected — not consent-gated |
| Network | Page assets + demo JS; no clear `/xcc` row in the captured shot | Acceptable; `/xcc` not always emitted |
| Identify (`/xur` / program ping) | Not observed as completed tracking | Pass for INITIATED |

### 7.2 After Accept

| Signal | Observed | Assessment |
|---|---|---|
| Demo consent store | `granted` | Pass |
| `IR_PI` | Present | **Pass** |
| Network | UTT `A3318275-….js` + **Type `ping`**, Name **`49266`**, status **204**, initiator = UTT | **Pass** — Identify-side flush (Chrome names the request by path segment / program id) |
| Inspector | `GRANTED → expect /xur/ + IR_PI` | Pass |

### 7.3 Interpretation for IE reviews

The post-Accept `49266` **ping** is what many engineers mean by “the Identify call,” even though DevTools does not label it `identify`. Full URL (Headers) should be checked for `xur` / `ur` / `cur`.

Consent calls remain visible (when emitted) as **`/xcc`** or **`/bcc`**, not as `consent`.

---

## 8. Pass / fail checklist (use on clients)

### Implementation

- [ ] UTT loader in `<head>` on all pages  
- [ ] `ire('consent','default',…)` **synchronously** after loader (not DOMContentLoaded / framework lifecycle)  
- [ ] `ire('identify',…)` immediately after default consent  
- [ ] CMP Accept → `ire('consent','update',{tracking:'granted'})`  
- [ ] CMP Reject → `ire('consent','update',{tracking:'denied'})`  
- [ ] Hostname in Impact site definition + deep linking  
- [ ] Consent Mode enabled for the account (support/process prerequisite)  

### Runtime (incognito, real tracking link)

- [ ] Before Accept: **no `IR_PI`**  
- [ ] Before Accept: no completed Identify (`/xur` / program tracking ping)  
- [ ] After Accept: **`IR_PI` present** + Identify-side request (`/xur` or ping `49266`-style)  
- [ ] After Reject: `/bcc` (when visible); still no Identify / no new `IR_PI`  

### Do not fail a client solely for

- `IR_gbd` before Accept  
- `IR_{programId}` before Accept  
- Missing Network row literally named `consent`  
- Missing `/xcc` when using a fake/short `im_ref`  

---

## 9. Client coaching: SPA / framework delay (same root cause we reproduced)

**10,000 ft:** TIP assumes HTML parses top-to-bottom so `consent` hits the `ire` queue before async UTT init. SPAs often break that timeline.

**1,000 ft:** Wrapping `ire('consent')` / `ire('identify')` in delayed lifecycle methods (`ngOnInit`, `useEffect`, custom `setConsentDefault()` after app bootstrap) lets UTT finish first.

**Feet on the ground — ask the client to:**

1. Remove framework delay for the initial `consent default` + `identify`  
2. Execute those two commands **synchronously, immediately after** the UTT loader snippet (inline in the shell HTML or the earliest sync script after the loader)  
3. Keep CMP **updates** in the banner handlers (`update` granted/denied)  

Gating the **entire UTT** behind Accept (GTM consent wall) is a different pattern and often yields “no Impact requests at all” until Accept — which is **not** the Consent Mode design documented for UTT (UTT loads; gatekeeper blocks tracking).

---

## 10. Recommendations

1. Keep https://simonderstine-oss.github.io as the **living gold standard** for IE demos and client comparisons.  
2. When reviewing clients, insist on **incognito + real tracking link + Network All/Fetch+XHR+Ping**.  
3. Train on **signal literacy**: `IR_PI` + `/xur` (or program ping) vs `IR_gbd` / `IR_{pid}` / missing `consent` label.  
4. For legal “are pre-consent cookies OK?” questions, route to **privacy counsel / Impact product** — separate from “is Consent Mode integrated per TIP.”  
5. Optionally extend the demo with a Reject path screenshot pack and a side-by-side “broken late consent” page for training.

---

## 11. Appendix — Quick command cheatsheet

```js
// Page load (head, sync, immediately after UTT loader)
ire('consent', 'default', { tracking: 'denied' }); // or 'granted' if returning opted-in user
ire('identify', {
  customerId: '',           // or real id
  customerEmail: '',        // or SHA-1 hash
  customProfileId: '<uuid>'
});

// CMP Accept
ire('consent', 'update', { tracking: 'granted' });

// CMP Reject
ire('consent', 'update', { tracking: 'denied' });

// Confirmation (Online Sale 70289)
ire('consent', 'default', { tracking: 'granted' /* or denied */ });
ire('trackConversion', 70289, { /* TIP payload */ }, { verifySiteDefinitionMatch: true });
```

### Network filters worth saving

```text
xcc bcc xur ur cur impct sjv A3318275 49266
```

---

## 12. Conclusion

The reference site now matches Impact’s recommended Consent Mode sequence and produces the right **gatekeeper outcomes**: no `IR_PI` / no Identify completion before Accept; after Accept, `IR_PI` and Identify-side traffic appear.

Early confusion came from (a) localhost/site-definition mismatch, (b) DOM-delayed consent (SPA-class bug), and (c) misreading non-gated cookies and DevTools naming. Those lessons are directly transferable to client debugging and to the coaching narrative used for framework-delayed integrations.
