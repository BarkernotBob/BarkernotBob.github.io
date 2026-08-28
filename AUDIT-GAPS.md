# Audit Gap Remediation — BarkernotBob.github.io

**Date:** 2026-07-12. Source: independent senior-level code audit covering the grocery app (`quartz/static/grocery/`, ~1,900 LOC ES modules), `pool/index.html` (1,421 LOC), `vehicle/index.html` (1,232 LOC), `bank-bonus/index.html` (2,398 LOC), the Cloudflare OAuth worker, the Playwright suite (`tests/grocery/`), `quartz/styles/custom.scss`, and the build/patch machinery. Grades: Architecture B+, Code quality B, Testing B−, Robustness B+, Maintainability B−.

**The core finding:** a pronounced quality gradient. The grocery app is the flagship (modular, XSS-hardened, race-safe data layer, adversarial test suite, fail-closed deploy gate). Pool, vehicle, and bank-bonus are earlier single-file monoliths that copy-pasted grocery's data layer WITHOUT its hardening or tests. The job below is mostly "retrofit every app to the bar grocery already proves the author can hit."

**Instructions for the agent picking this up:** work in priority order (P1 → P3). Follow CLAUDE.md: issue files with acceptance criteria (+ "Manual test (for Isaiah)" on completion), small checkpoint commits, medium code-review per diff, never call a UI fix done without a screenshot, keep the local-script vs deploy.yml patch parity intact at every step. Grocery's Playwright suite (`tests/grocery/`) must stay green; it is the template for the new suites.

---

## P1 — Cracks that WILL appear on an update

### GAP-W1: Silent-failing `sed` patches on the Quartz build
`deploy.yml:36-49`, `Publish Changes.command`, and `Preview Website.command` patch Quartz's *minified* plugin dist via `sed` (`tokenize:"forward"`→`"full"`; explorer breakpoint `800px`→`99999px`). `sed` silently no-ops when the pattern doesn't match — so ANY upstream Quartz change to that minified output makes the patch vanish with a green build and a subtly broken live site (the explorer patch is load-bearing for the home page per CLAUDE.md). The same patches are also duplicated in three places (known sync hazard).
**Fix:** migrate all sed patches into `patch-plugins.mjs`, which already does this right — guard markers for idempotency (`patch-plugins.mjs:35`), regex capture of bundler-renamed vars (`:57,:81`), and loud failure ("anchor not found, left unchanged", `:42`). Have deploy.yml and both `.command` scripts call the ONE script; make the build FAIL (non-zero exit) when an anchor isn't found.
**AC:** zero sed-based plugin patching anywhere; one shared patch script invoked by all three entry points; an intentionally-broken anchor fails the GitHub Actions build; live-site verification that the home-page drawer + full-token search still work after deploy.

### GAP-W2: Zero test coverage on 3 of 4 token-handling/shipping apps
Only grocery (1 of 5 apps) has tests. Pool, vehicle, and bank-bonus — 5,000+ combined lines, two of them handling GitHub tokens — have none, and nothing tests the Quartz build or the patches (GAP-W1 covers the latter). Any update to those apps ships blind.
**Fix:** stand up Playwright suites `tests/pool/`, `tests/vehicle/`, `tests/bank-bonus/` modeled on `tests/grocery/` (reuse `mock-github.js` — move it to `tests/shared/`). Minimum per app: boot with clean console, core flow smoke tests, security spec (no inline-handler regression once GAP-W4 lands, XSS payload renders inert), screenshot pass at the three standard viewports. Wire each into the deploy gate with the same change-detection + fail-closed pattern grocery uses (`deploy.yml:65-135`).
**AC:** each app has a suite that runs in CI on changes to that app's files; a failing test blocks deploy; skipped (untouched app) does not.

### GAP-W3: Over-broad OAuth scope (`scope=repo`)
The authorize URL requests `&scope=repo` (`quartz/static/grocery/app.js:447`, `pool/index.html:810`) — full read/write to EVERY private repo, when each app only needs its one data repo. Biggest single security finding.
**Fix (pick one, document the decision):** (a) migrate to a GitHub App with per-repo installation — least privilege, more moving parts; or (b) keep OAuth but have SETUP docs walk Isaiah through a fine-grained PAT restricted to the data repo as the recommended path, demoting broad OAuth to fallback. Update the Cloudflare worker docs (`pool-tool/worker/`) accordingly.
**AC:** default setup path grants access to only the data repo(s); SETUP.md / SETUP-CHECKLIST.md updated with plain-English steps; existing users' flow still works.
**RESOLVED 2026-08-28 — option (b).** Rationale, and why the scope itself cannot simply be narrowed (a classic OAuth App has no per-repo scope, so narrowing *is* option (a)): [`DECISION-github-access-scope.md`](DECISION-github-access-scope.md).

## P2 — Security hardening parity

### GAP-W4: Older apps are not XSS-hardened, on a shared origin with tokens
All apps share the `barkernotbob.github.io` origin; `gt_token`, `pl_token`, `bb_token` all sit in plaintext localStorage readable by any script on the origin. Grocery is hardened (0 inline handlers, event delegation `app.js:62-102`, single-quote-safe `esc()` `core/domain.js:16-19`, enforced by `security.spec.js`). The others are not: **bank-bonus has 78 inline `on*` handlers, pool 39, vehicle 34.** An injection in the weakest app can read the strongest app's token.
**Fix:** retrofit pool, vehicle, bank-bonus to grocery's pattern — event delegation, zero inline handlers, hardened `esc()` everywhere user/remote data is rendered. Land AFTER GAP-W2's suites exist so the retrofit is regression-guarded; add the same "zero inline handlers + inert payload" security spec per app.
**AC:** grep shows 0 inline `on*=` handlers in all four apps' HTML/JS; each app's security spec asserts it; manual smoke test per app.

### GAP-W5: Shared data-layer library instead of 4 copies
`ghHeaders()`, the `LS` accessor, `esc()`, `toast()`, `modal()`, `uid()` are copy-pasted per app (e.g. `ghHeaders` byte-identical at `grocery/app.js:116` and `pool/index.html:250`). Grocery's fixes (esc single-quote, race-safe `commitFiles` with delta replay `app.js:255-292`) exist ONLY in grocery — bug fixes don't propagate.
**Fix:** extract a shared ES module dir `quartz/static/shared/` (data layer: headers, commitFiles + applyDelta, LS factory; ui: esc, toast, modal, uid). Migrate grocery first (its tests prove the extraction), then the others as part of GAP-W4's retrofit. Keep the deliberate shared OAuth client ID documented in one place.
**AC:** one implementation of each helper, imported by all apps; grocery suite green before and after; delta-replay/race tests still pass against the shared module.

## P3 — Consistency & hygiene

### GAP-W6: Vehicle app violates the house PWA rule
`quartz/static/vehicle/` ships no `sw.js` and no manifest, despite CLAUDE.md mandating every app be a PWA (double-tap zoom disabled, no zoom on inputs, numeric keyboards, date pickers). Also cosmetic drift: bank-bonus uses `manifest.json` while grocery/pool use `.webmanifest`.
**Fix:** add vehicle's manifest + read-only SW cloned from grocery's (`grocery/sw.js` — correctly scoped: refuses cross-origin/non-GET/api.github.com, stale-while-revalidate, versioned cache). Normalize all apps to `.webmanifest`. Extend `pwa.spec.js`-style checks to every app (fold into GAP-W2).
**AC:** all four apps pass the grocery PWA spec checks (manifest, SW activation, input font-size ≥16px, touch-action).

### GAP-W7: No CI lint/format gate for app code
Upstream `ci.yaml` is gated `github.repository == 'jackyzha0/quartz'` so it never runs on this fork; `.prettierignore` doesn't cover the apps. Result: unlinted code and formatting drift *inside* grocery itself — `domain.js`/`components.js`/`today.js` are clean, but `app.js` and `review.js` are semicolon-packed one-liners (593-char line at `app.js:310`; `resolveFlag` crams statements at `review.js:88-98`), and `viewReceipt` builds HTML via ~200-char nested ternaries (`app.js:573-591`).
**Fix:** add a lightweight CI job (own workflow or a deploy.yml job) running Prettier --check + ESLint over `quartz/static/{grocery,pool,vehicle,bank-bonus,shared}`; format the existing code once; refactor `viewReceipt`'s ternary pile into readable helpers while under test.
**AC:** CI fails on unformatted/unlinted app code; whole tree formatted; no functional change (grocery suite green).

### GAP-W8 (lowest): `custom.scss` !important load
823 lines, 56 `!important` declarations — inherent to overriding Quartz but a maintainability smell. Opportunistic only: when touching a rule, prefer higher-specificity scoped selectors (the `body:has(.home-splash)` pattern already used) over new `!important`s. No dedicated issue needed; add as a review checklist item.

---

**Explicitly NOT gaps (don't "fix"):** the OAuth code-exchange worker design (textbook-correct: secret stays in Cloudflare env, CORS locked to the origin, stateless); GitHub-as-database with atomic Git Data commits + lost-update replay (a strength — extract it, GAP-W5, don't replace it); the fail-closed deploy gate; the docs-vs-code repo split (`grocery-tool/` = docs, `quartz/static/grocery/` = code).

**Suggested order:** W1 → W2 → W5 (grocery extraction) → W4 (+W5 rollout) → W3 → W6 → W7 → W8. W1 first because it can break the live site with a green build TODAY; W2 before any retrofit so refactors land regression-guarded.
