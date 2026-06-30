# CarEdge Auto-Pull — Strategy Decision

**Status:** Phase 1 shipped — one-click bookmarklet + paste/import box both live
**Date:** 2026-06-30

> **Update (shipped):** Both halves are built under one Settings → **"Add a car from CarEdge"** card.
> Step 1 sends the user to `caredge.com/depreciation`; Step 2 offers **two interchangeable paths into the
> same paste box**: *Option 1* a draggable one-click bookmarklet (desktop), *Option 2* plain **select-all
> + copy of the Depreciation page** (works on phones, no setup). The paste box auto-detects which it got.
> Readable bookmarklet source: `vehicle-tool/caredge-grab.bookmarklet.js` (the minified copy is inlined as
> the button's `href` in `index.html`).
>
> **Paste-the-page parser (`ceParsePage`):** the copied page is plain text. The **primary** parser
> (`ceParseAgeTable`) reads the **"Years Old / Depreciation / Residual Value / Resale Value / Est. Mileage /
> Resale Year"** table — CarEdge's real 12-year depreciation schedule. That drives the value curve (resale
> value by age, plus a derived age-0 new price) and insurance (the page's "…is about $X per year" base,
> scaled by each year's **Residual %** so insurance depreciates with the car). Maintenance isn't in that
> table, so it's merged in by model year from the `Current Price / Maintenance` table on the same page
> (ages past its range get 0 and the engine extrapolates). A `ceParseYearTable` fallback handles pages
> without the Years-Old table. The import flow now lives on the **Add vehicle** screen (not Settings), with
> the bookmarklet and copy/paste as two options. A pasted URL still can't work — CORS blocks the static app
> from fetching `caredge.com`; copying the page sidesteps that with zero setup.
>
> **How it works against the real CarEdge (verified on a Toyota Sienna sample):**
> - CarEdge is Next.js, server-rendered. The car's **Depreciation page** table carries *both* the
>   per-model-year **Current Price** *and* **Maintenance** (and a **% Paid** value column), so it alone
>   yields a usable car — the separate maintenance page is **not needed**.
> - The bookmarklet runs on that page, reads its table, then **same-origin `fetch()`es** the sibling
>   `…/insurance` page (for the base annual premium) and the hub page (for MPG + powertrain) — one click,
>   no extra navigation. Same-origin means no CORS wall and the user's own logged-in session is used.
> - **Insurance** on CarEdge is a single driver-based base rate (not per-model-year), so per the owner's
>   call it's **scaled down by each year's % Paid** (value) → insurance depreciates with the vehicle.
> - **Registration** isn't on CarEdge → left blank for the user to fill.
> - Emits `{name, make, model, pt, mpg, rows:[[year,price,maint,ins,reg],...]}`, copies to clipboard;
>   the paste box parses it (also accepts hand-pasted CSV/TSV).
>
> **Known limits:** the depreciation table renders ~6 model-years (the engine extrapolates the rest);
> bookmarklets are desktop-only (phones use the paste box); brittle to a CarEdge redesign — update the
> source file and re-drag. If CarEdge ever sets a strict CSP that blocks the inline bookmarklet, switch
> to a hosted-loader variant.
**App:** Driveline vehicle cost calculator — `quartz/static/vehicle/index.html`, served at `/static/vehicle/`

---

## Decision

Implement a **bookmarklet / paste-import (user-side, personal extraction)** as the **Phase 1** CarEdge auto-pull. Defer the prebuilt-catalog and licensed-API approaches to a Phase 2 that is gated on a scope/legal decision (see open questions).

This is the only approach that is $0, server-less, secret-less, and lowest legal exposure — each user pulls **only their own** data, and nothing is redistributed.

---

## Why (the constraints that forced this)

Verified via research on 2026-06-30:

- **No public CarEdge API / feed / export.** `caredge.com/dev-affiliates` and `/dev-insights` are draft *marketing/referral* pages ("dev-" = development-stage marketing page, not "developer"), not a data product. Paid plans ($9.99/mo Data, $49/mo Pro) only show data on-screen.
- **No CORS.** A visitor's browser cannot fetch `caredge.com` from the GitHub Pages app. Any server-side fetch must run in the *owner's* context, never the anonymous client.
- **CarEdge Terms of Use ban scraping/crawling/derivative use**, with a stated **$25,000-per-instance** liquidated-damages clause (plus a separate $5,000-first / $25-each tier for AI-pricing misuse). CarEdge's valuations are **licensed from Black Book** underneath, so republishing them is doubly restricted. *(Exact wording came from search snippets — the live page blocks bots — confirm at `caredge.com/terms` in a normal browser before relying on it. Penalty enforceability is jurisdiction-dependent.)*
- **"Through my Claude subscription" is independently blocked.** As of **April 4, 2026** Anthropic prohibits third-party tools from using Pro/Max subscription quota (confirmed on `code.claude.com/docs/en/legal-and-compliance`). Any AI extraction must use a **metered API key**, not the subscription.
- **App must stay stranger-safe:** no secrets in the client, no unbounded owner cost.

**Net:** a true "select any car → instant auto-fill from CarEdge" is **not legitimately achievable**. The bookmarklet sidesteps every wall because it runs first-party inside the user's own logged-in CarEdge tab.

---

## How the bookmarklet works

- A **bookmarklet** is a bookmark that stores a small snippet of code instead of a web address. Clicking it runs that snippet **on whatever page you're currently viewing** — it doesn't navigate anywhere.
- Because it runs *inside the user's own CarEdge tab* (which they're logged into and looking at), it's the page reading its own numbers on the user's behalf. That avoids the CORS wall (first-party) and is **not** automated cross-site scraping — it's the user copying data they're authorized to see, for themselves.

**Flow:**
1. **One-time setup (~30s):** user drags a "Send to Driveline" button to their browser's bookmarks bar. No download, no account, no app store.
2. **Per car:** open the car's CarEdge cost/depreciation page → click the bookmarklet → it reads price-by-model-year, maintenance, insurance, fuel, etc. → copies a JSON/CSV bundle to the clipboard (or opens Driveline with the data attached).
3. In Driveline, hit **Import / Paste** → that car's fields fill in automatically.

---

## Limits / honest caveats

- **Not "instant select."** The user still visits CarEdge once per car; it removes the *typing*, not the *visiting*.
- **Only works for users with CarEdge access.** Everyone else keeps manual entry (which still works).
- **Brittle to CarEdge redesigns.** It reads the page's layout, so a CarEdge layout change requires a small bookmarklet update.
- **Per-user, nothing shared/server-side** — which is exactly why it's the safest option legally.
- **Mainly a desktop pattern.** Bookmarklets are clunky on mobile (esp. iOS). Realistic flow: pull on a computer, then Export/Import Driveline's JSON to the phone. A **browser extension** is the mobile-friendly upgrade (same first-party idea, but installs once and adds a real button — at the cost of more setup + a Chrome Web Store listing).

---

## What to build when we implement

1. **Import box in Driveline** (in Settings or the Add-vehicle flow) that accepts the bookmarklet's JSON/CSV and maps it onto a vehicle's `rows` (`[modelYear, price, maint, ins, reg]`) plus `mpg`.
2. **The bookmarklet itself:** reads the CarEdge cost/depreciation page — prefer its embedded data blob (e.g. Next.js `__NEXT_DATA__`/hydration JSON) over DOM scraping if present — normalizes to Driveline's schema, copies to clipboard.
3. **A short "install + use" helper** (a few lines + the draggable button) in the app or on the Tools page.
4. **First, verify the real CarEdge page structure in a normal browser** (server-rendered numbers vs a JSON blob, and field names/units) — the research environment couldn't load the live page.

---

## Options considered but deferred/rejected (so we don't re-research)

- **Prebuilt catalog (owner-curated):** owner pulls a finite car list, commits JSON to a data repo the app reads (same pattern as grocery/bank-bonus). Instant UX, client stays stranger-safe — **but** publicly republishing CarEdge's data is the ToS violation. Only OK if gated/personal, licensed by CarEdge, or sourced from a licensed API.
- **AI-built catalog:** rendering scraper (Firecrawl/Browserless) → Claude (metered API key) maps HTML to schema → commit JSON. A more *robust way to build the catalog*, same legal catch; must use an API key, **not** the Claude subscription.
- **Licensed alternative API — VinAudit:** the only third-party with a real cost-to-own feed. Blockers: quote-only pricing (not public), "own-use" license (public re-display needs a written grant), and a **forward-5-year-per-VIN** projection (needs ~10 calls/car + a model remap, not the ~10 historical model-years Driveline uses). CarAPI is cheap/public but only provides MPG, no cost data.
- **AVOID:** live Cloudflare Worker proxy (no CarEdge API to proxy; brokers the owner's personal session to strangers); third-party scraper as a public feed (aggravated legal posture + recurring cost); Claude Pro/Max subscription (prohibited by Anthropic).

---

## Open questions to confirm before Phase 2 (catalog/API)

1. **Audience/scope:** public for strangers / gated-personal / public-paste-only? *(default: public + paste-only)*
2. Willing to **contact CarEdge** for written data-license / redistribution terms?
3. Accept a **licensed alt API (VinAudit)** despite shape mismatch + "own-use" license?
4. **Coverage/freshness:** finite curated list / any-car on demand / whatever the user can paste?
5. If a catalog: **who runs the refresh** — manual on owner's machine (likely required) vs fully automated?

---

## Sources

- CarEdge Terms — https://caredge.com/terms
- CarEdge cost page example — https://caredge.com/honda/cr-v/costs
- CarEdge dev-affiliates — https://caredge.com/dev-affiliates
- Black Book values (CarEdge guide) — https://caredge.com/guides/what-are-black-book-values
- VinAudit Vehicle Ownership Cost API — https://www.vinaudit.com/vehicle-ownership-cost-api
- CarAPI pricing — https://carapi.app/pricing
- Anthropic Claude Code legal/compliance — https://code.claude.com/docs/en/legal-and-compliance
