# Consent Mode Gold Standard — Simon Demo (49266)

**Site:** https://simonderstine-oss.github.io  
**UTT:** `A3318275-654b-4b94-bfb3-76b3e4e02aea1.js` · **Event:** Online Sale `70289`

## Why

Known-good Consent Mode reference so IEs can compare client setups (and coach SPA timing bugs).

## Correct integration (non-negotiable)

```html
<!-- <head> -->
<script>/* UTT loader stub */</script>
<script>
  ire('consent', 'default', { tracking: 'denied' }); // or 'granted' if returning opted-in
  ire('identify', { customerId: '', customerEmail: '', customProfileId: '…' });
</script>
```

Banner: Accept → `ire('consent','update',{tracking:'granted'})` · Reject → `…denied`  

Must be **sync, immediately after the loader** — not `DOMContentLoaded` / React / Angular. Same bug as clients who delay `setConsentDefault()` until after UTT init.

Also: hostname must be in **site definition + deep linking** (localhost won’t work).

## What “working” looks like

| Moment | Cookies | Network |
|---|---|---|
| Before Accept | **No `IR_PI`**. `IR_gbd` + `IR_49266` OK | No Identify. `/xcc` optional |
| After Accept | **`IR_PI` appears** | Identify: `/xur`/`/ur` **or** Chrome **ping** named **`49266`** |
| After Reject | No `IR_PI` | `/bcc` |

There is **no** request named `consent`. Consent = `/xcc` or `/bcc`. Identify ≠ a row labeled `identify`.

## Do not fail a client for

- `IR_gbd` / `IR_{programId}` before Accept  
- Missing Network row called `consent`  
- Missing `/xcc` with a fake `im_ref` (use a real tracking link)

## Fail a client for

- `IR_PI` or Identify (`/xur` / program ping) **before** Accept  
- `consent`/`identify` deferred until after UTT loads (SPA/GTM delay)  
- UTT blocked entirely until Accept (different pattern; not this TIP)

## Our test result

Real tracking link, incognito: before Accept → no `IR_PI`; after Accept → `IR_PI` + ping `49266` (204). **Pass — Consent Mode correct.**
