# tests/pool

Playwright regression rig for **Pool Care** (`quartz/static/pool/`).
Second of the three suites GAP-W2 (issue [#109](https://github.com/BarkernotBob/BarkernotBob.github.io/issues/109))
calls for; `tests/bank-bonus/` is the closest template, `tests/grocery/` the original.

## Why

Before this, pool shipped blind: ~1,400 lines, a GitHub token, and the audit
counted eight pull requests on this app mostly re-covering the same ground — a
change could not be verified before it landed, so the bug got found on a phone
and cost a whole session to fix.

On its first run this suite found three things:

- **Editing the opening or closing checklist did nothing at all.** `modal()`
  detached its overlay and only *then* resolved, so `editChecklist()` read
  `#cl_steps.value` off `null`, threw, and saved nothing — silently. This is the
  identical bug bank-bonus shipped in two flows (#119); the fix is the same one,
  in `modal()` itself, so it covers every caller rather than just this one.
  `modals.spec.js` is the regression cover.
- **Every cold start fetched all four data files twice.** The boot handler
  kicked off `show()` without awaiting it and then called `loadAll()` alongside
  it — eight GitHub calls for four files, on a phone, before anything appeared.
  Loading once, before the first render, also means saved target ranges are
  applied before the render that uses them instead of racing it.
- **Settings scrolled the whole app sideways at 390px.** Two date inputs in one
  `.row` could not shrink below their intrinsic width, because a flex item
  defaults to `min-width:auto`.

## What's here

| File | Covers |
| --- | --- |
| `boot.spec.js` | Boots with a clean console, every tab renders, only GitHub and Open-Meteo are contacted, signed-out shows setup and calls nothing, reload keeps the session, the PWA files parse |
| `flows.spec.js` | One smoke test per main flow — mark a task done, log a strip test and a numeric test, log swim time, edit a task, mark a seasonal checklist done, pool and season settings, history, weather, and a GitHub failure surfacing |
| `modals.spec.js` | The dialog contract: fields readable when the promise resolves, no overlay left behind on any close path, the sign-out confirm gating both ways |
| `chemistry.spec.js` | The seven pads on Isaiah's strip and the six chemicals in his shed — the strip form's pads and order, phosphates as a lab-only extra, advice naming a chlorine he owns, hardness steering cal-hypo vs. liquid, high pH becoming a shopping note, chloramines dosed once (but never confused with a routine top-up), bromine never counted as off target or drawn red in history, an emptied shed staying empty, and an older config migrating its chemical keys and gaining the new target ranges |
| `security.spec.js` | A hostile value renders as inert text, seeded across config/tests and round-tripped |
| `screenshots.spec.js` | Every tab at 390 / 900 / 1300px, attached to the report, asserting no sideways page scroll |
| `sync.spec.js` | The GitHub Contents API path against `tests/shared/mock-github.js` — reads, shas, the stale-sha retry, a missing file, and the sign-in screen |

## How it boots

**Pool is not local-first, and that is the main way this suite differs from
bank-bonus's.** Pool stores nothing but the sign-in itself (`pl_repo`,
`pl_token`, `pl_login`, `pl_method`, `pl_device`) and reads every byte of data
from the GitHub Contents API. There is no offline mode, so there is no
`bootApp()`/`bootSynced()` split — every booted test runs against
`tests/shared/mock-github.js`.

Three things are pinned so the suite is deterministic:

- **The clock, to 2026-07-15** (in season, in peak). Pool's whole Today screen is
  a function of the date — which tasks are due, whether it is in season, whether
  the open/close prompt shows. Left on the real clock this suite would quietly
  change meaning every day and go red on 2026-10-06 when the season closes. The
  browser is forced to UTC in `playwright.config.js` to match, since the app
  derives its date with `toISOString()`.
- **The weather.** The app calls Open-Meteo on every Today and Weather render.
- **The fonts.** Google Fonts is a `<link>` in the head; unreachable in CI it
  logs a resource error and the clean-console assertion fails for a reason that
  has nothing to do with the app.

Anything else that reaches the network is recorded and blocked, and
`boot.spec.js` asserts that list stays empty — so a newly added third-party call
shows up as a test failure rather than being noticed in a later privacy review.

Four things worth knowing before you extend it:

- **`addInitScript` runs on every navigation, reloads included.** The seed
  therefore only fills keys that are missing. Seed unconditionally and any test
  that reloads to prove something persisted will have its own saved value
  overwritten by the fixture on the way back in — which looks exactly like the
  app failing to save. (Learned on `tests/bank-bonus`; it bites here too.)
- **Playwright matches routes most-recently-registered first.** `bootApp()`
  installs the GitHub mock and a catch-all, so a `page.route()` registered
  *before* it never sees the request. Observe with `page.on('request')`; to
  override a response, register the route after `bootApp()` and reload.
- **Fixture overrides go in through `bootApp(page, { db: {...} })`**, which lands
  them as a commit before the first navigation. The shared mock has no seed-time
  override hook.
- **The fixtures are synthetic.** This is a public repo; never paste real pool
  or account data in here.

## Scope

Not wired into the deploy — that edits `.github/workflows/deploy.yml`, which is
GAP-W2b ([#110](https://github.com/BarkernotBob/BarkernotBob.github.io/issues/110)).
When it is, add `tests/pool` alongside `tests/bank-bonus`.

`security.spec.js` carries one **deliberately known-failing** test, marked
`test.fail()`: a task id from the data repo breaks out of the inline `onclick`
handler it is interpolated into. It is pinned, not skipped — the suite is green
while the hole is open, and the run turns red the moment it is fixed ("expected
to fail but passed"), which is the prompt to delete the marker. It is not
patched here because pool has ~39 inline handlers and this suite audited a
handful; a partial fix would turn the spec green across the ones it says nothing
about. That rewrite is GAP-W4
([#112](https://github.com/BarkernotBob/BarkernotBob.github.io/issues/112)).

Vehicle is the one still to do, on #109 — pure localStorage, no GitHub path to
mock at all, so it should be the easiest of the three.

## Running it

```bash
cd tests/pool
npm install
npx playwright install chromium   # skip where a browser is already provisioned
npx playwright test
```

The rig serves the repo's `quartz/` directory at the server root (port 5176), so
the app sits at `/static/pool/` exactly as it does live. Port 5176 keeps it
runnable alongside `tests/grocery` (5173), `tests/install-checks` (5174) and
`tests/bank-bonus` (5175).

Where Chromium is already on disk, point at it instead of downloading one:

```bash
PW_CHROMIUM_PATH=/path/to/chromium npx playwright test
```
