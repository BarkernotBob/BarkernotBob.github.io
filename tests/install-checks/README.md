# tests/install-checks

Cross-app PWA install checks for all four apps: **grocery, pool, vehicle, bank-bonus**.

`CLAUDE.md` promises every app is installable to the phone home screen, with
double-tap zoom off and no zoom when tapping into a field. `tests/grocery/pwa.spec.js`
enforced that for grocery alone — this rig holds the other three to the same bar,
so a dropped manifest, a re-added `maximum-scale` or a sub-16px input fails on any
app (GAP-W6, issue #114).

## What it checks, per app

1. The manifest is linked, parses, is `display: standalone`, declares 192px + 512px
   icons and at least one maskable one, and every icon file it names actually resolves.
   The link must end in `.webmanifest` — bank-bonus used to be the odd one out.
2. `apple-touch-icon`, both `*-web-app-capable` metas, and a `theme-color` are present.
3. The viewport allows pinch-zoom (no `maximum-scale`, no `user-scalable`) while
   `touch-action: manipulation` kills double-tap zoom.
4. The service worker registers and reaches `active`.
5. No `input` / `select` / `textarea` in the document renders below 16px — that is
   what makes iOS zoom in when you tap a field. Controls that show no text of their
   own (range, checkbox, radio, file, …) are exempt.

## Scope

Install compliance only. Per-app behaviour suites for pool, vehicle and bank-bonus
are GAP-W2 (issue #109), not this file's job.

## Not yet wired into the deploy

This suite does **not** run in CI. Wiring it in means editing
`.github/workflows/deploy.yml`, which the nightly routine is forbidden to touch —
so for now it only runs when someone runs it. GAP-W2b (issue #110, labelled
`hold`) is the attended-session item that adds the app suites to the deploy gate;
add this one there too.

## Running it

```bash
cd tests/install-checks
npm install
npx playwright install chromium   # skip where a browser is already provisioned
npx playwright test
```

The rig serves the repo's `quartz/` directory at the server root (port 5174), so
every app sits at `/static/<app>/` exactly as it does on the live site. That layout
is load-bearing: bank-bonus links its manifest and scopes its service worker with
absolute `/static/bank-bonus/` paths, which resolve no other way. Port 5174 also
keeps this rig runnable alongside `tests/grocery` (5173).

In a managed environment with Chromium already on disk, point at it instead of
downloading one:

```bash
PW_CHROMIUM_PATH=/path/to/chromium npx playwright test
```
