# Grocery Tracker regression rig (PRD S0)

Playwright suite that guards the Grocery Tracker app
(`quartz/static/grocery/index.html`). Runs in `deploy.yml` before publish and
blocks the deploy on red (see the gating notes below). All GitHub API traffic is
mocked with **synthetic** fixtures — never real data (this is a public repo).

## Run locally

```sh
cd tests/grocery
npm install
npx playwright install --with-deps chromium   # first time only
npm test                                       # headless
npm run test:headed                            # watch it drive the app
npm run report                                 # open the HTML report
```

The config starts a throwaway static server (`python3 -m http.server`) over
`quartz/static/`, so the app loads at the same relative path it ships at
(`/grocery/index.html`).

## What it covers (§13 assertion classes)

- **render.spec.js** — every view loads from the mocked db with a clean console;
  boot lands on Capture; review badge counts flags + due reminders.
- **security.spec.js** — the two S0 prereq fixes: no inline `on*` handlers in any
  view, and a `<img onerror>` payload in an item name/id is escaped, not run.
- **flows.spec.js** — table sort (with a no-reflow check), column filter, reports
  range, flag resolve, reminder action — all against the mock.
- **screenshots.spec.js** — every view × {390, 1024, 1400} saved to
  `screenshots/`, uploaded as the CI visual-verification artifact.

## Fixtures

`fixtures/db/*.json` mirror the real schema (`grocery-tool/schema`) with a
handful of synthetic rows, including one deliberately malicious item to exercise
escaping. Edit these to add cases; keep them synthetic.

## Deploy gating (deploy.yml)

A `changes` job (dorny/paths-filter) flags commits touching
`quartz/static/grocery/**`, `tests/grocery/**`, `.github/workflows/deploy.yml`,
or `quartz.config.default.yaml`. The `test` job runs only then. `deploy` uses
`needs: [build, test]` with
`if: ${{ !cancelled() && needs.build.result == 'success' && needs.test.result != 'failure' }}`
so **skipped counts as pass** (non-grocery publishes never blocked) and
**failed blocks the deploy** (red never ships).

## Prove the guard works

Break a selector on purpose (e.g. rename `#ttable` in the app) and run `npm test`
— `table` render + sort tests go red. Revert to green.
