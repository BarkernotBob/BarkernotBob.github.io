# tests/bank-bonus

Playwright regression rig for the **Bank Bonus Tracker** (`quartz/static/bank-bonus/`).
First of the three suites GAP-W2 (issue #109) calls for; `tests/grocery/` is the
template it copies.

## Why

Before this, bank-bonus shipped blind: no tests, ~2,400 lines, and it handles a
GitHub token. The audit counted nine pull requests on this app, mostly re-covering
the same ground — a change could not be verified before it landed, so the bug got
found on a phone and cost a whole session to fix.

On its very first run this suite found that **"+ Add Account" and "+ Add Offer"
both did nothing at all** — `modal()` detached the dialog before resolving, so
every caller read its form fields off `null` and threw. `modals.spec.js` is the
regression cover for that.

## What's here

| File | Covers |
| --- | --- |
| `boot.spec.js` | Boots with a clean console, every tab renders, local mode makes no network calls, a reload keeps the store |
| `flows.spec.js` | One smoke test per main flow — filters, mark-as-opened, promote an offer, add/delete by hand, reports totals, calendar, settings |
| `modals.spec.js` | The dialog contract: fields readable when the promise resolves, no overlay left behind on any close path |
| `security.spec.js` | A hostile value renders as inert text, seeded and round-tripped |
| `screenshots.spec.js` | Every tab at 390 / 900 / 1300px, attached to the report, asserting no sideways page scroll |
| `sync.spec.js` | The GitHub-backed path, against `tests/shared/mock-github.js` |

## How it boots

bank-bonus is **local-first**: until a token is connected it reads and writes
`localStorage` and never touches the network. So most tests seed the browser store
straight from `fixtures/db/` and run with `api.github.com` blocked outright — which
also means `boot.spec.js` can assert that promise directly. `bootSynced()` is the
other half, flipping the app into `github` mode against the shared mock.

Two things worth knowing before you extend it:

- **`addInitScript` runs on every navigation, reloads included.** The seed
  therefore only fills keys that are missing. Seed unconditionally and any test
  that reloads to prove something persisted will have its own saved value
  overwritten by the fixture on the way back in — which looks exactly like the app
  failing to save.
- **The fixtures are synthetic.** This is a public repo; never paste real account
  data in here.

## Scope

Not wired into the deploy — that edits `.github/workflows/deploy.yml`, which is
GAP-W2b (#110). Pool and vehicle are still to do, on #109.

## Running it

```bash
cd tests/bank-bonus
npm install
npx playwright install chromium   # skip where a browser is already provisioned
npx playwright test
```

The rig serves the repo's `quartz/` directory at the server root (port 5175), so
the app sits at `/static/bank-bonus/` exactly as it does live — this app links its
manifest and scopes its service worker with absolute `/static/bank-bonus/` paths,
which resolve no other way. Port 5175 keeps it runnable alongside `tests/grocery`
(5173) and `tests/install-checks` (5174).

Where Chromium is already on disk, point at it instead of downloading one:

```bash
PW_CHROMIUM_PATH=/path/to/chromium npx playwright test
```
