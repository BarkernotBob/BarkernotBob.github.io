# tests/vehicle

Playwright regression rig for **Driveline**, the vehicle cost-of-ownership tool
(`quartz/static/vehicle/`). The last of the three suites GAP-W2
([#109](https://github.com/BarkernotBob/BarkernotBob.github.io/issues/109))
calls for, after `tests/bank-bonus/` and `tests/pool/`.

## Why

Before this, vehicle shipped blind: ~1,240 lines and, per the audit, five pull
requests mostly re-covering the same ground.

On its first run this suite found **a live cross-app security hole**. Vehicle ids
were interpolated raw into `data-veh="…"` (garage) and `data-sel="…"` (compare).
An id of:

```
x" onmouseover="window.__pwned=1" data-z="
```

closed the attribute and created a real event handler that ran on hover —
confirmed executing in a browser. The realistic route is import: `importData()`
takes ids from the file verbatim, so opening a `driveline-vehicles.json` someone
sent you was enough. And because all five apps share the origin
`barkernotbob.github.io`, code running here can read `gt_token`, `pl_token` and
`bb_token` out of the same localStorage — so this app, which holds no token of
its own, was the cheapest way to steal the other three's.

**Unlike the inline-handler breakouts pinned in bank-bonus and pool, this one is
genuinely fixed by escaping**, because it lands in an attribute value rather than
inside JavaScript: `esc()`'s `"` → `&quot;` closes it completely.
`security.spec.js` covers it seeded, imported and typed.

The first attempt at that fix escaped only `id` and `name`, and `/code-review`
caught that it was incomplete: `pt`, `mpg`, `fuelPriceOverride`, `loanYears`,
`down` and all five depreciation-row columns were interpolated raw too, and
`importData()` coerces none of them to numbers. The worst of those needed no
import at all — the Year box keeps whatever you type while it isn't yet a number
(so clearing it to retype doesn't destroy the row), and that value went straight
back into `value="…"` on the next render. **Every** interpolated field now goes
through `esc()`, and the hostile-import fixture carries a payload in every field
rather than in the two that were already fixed.

It also found a second, non-security bug on the same path: a year that isn't a
number made `refYear` NaN → `maxAge` NaN → `optimal()` return `null`, and the
whole vehicle screen died on `opt.buyAge`. `prep()` now models only rows with a
real year, and `maxAge` no longer collapses to `-Infinity` on an empty set.

## What's here

| File | Covers |
| --- | --- |
| `boot.spec.js` | Boots with a clean console, every view renders, the app contacts nothing at all, the samples fall back on a fresh device, corrupt state recovers, reload persists, the PWA files parse |
| `flows.spec.js` | One smoke test per main flow — the four assumptions (including the percent-vs-fraction conversion and the NaN guard), add, rename, MPG changing the model output, delete, depreciation rows, purchase point, compare selection, reset to samples |
| `persistence.spec.js` | Export, an export/import round trip, a junk file and a valid-but-wrong file both refused without destroying the garage, and nothing ever rendering as `NaN` |
| `security.spec.js` | Hostile values inert seeded, imported and typed; the attribute breakout above; and the no-data-bearing-inline-handler guard |
| `screenshots.spec.js` | Every view at 390 / 900 / 1300px, plus both detail tabs, attached to the report, asserting no sideways page scroll |

## How it boots

**Vehicle is the exact opposite of pool.** Where pool keeps nothing locally and
reads every byte from GitHub, vehicle keeps everything locally and talks to
nothing: one localStorage key (`driveline.v1`) holds the whole state, and there
is no token, no sync and no API. So there is **no mock here at all**, and
`boot.spec.js` asserts the app makes no outbound request whatsoever — the list
of blocked off-origin requests must stay empty.

There is also no clock to pin: the app contains no `new Date()` anywhere, and its
model years are literal numbers in the data, so a run today and a run next year
compute identical figures. (Pool needed the opposite treatment — see its README.)

Two things worth knowing before you extend it:

- **`addInitScript` runs on every navigation, reloads included.** The seed only
  fills the key if it is missing. Seed unconditionally and any test that reloads
  to prove something persisted has its own saved value overwritten by the fixture
  on the way back in — which looks exactly like the app failing to save. This is
  the single most expensive trap in these three rigs; it bit `tests/bank-bonus`
  first.
- **The app's dialogs are native `prompt()`, `confirm()` and `alert()`,** not
  in-page modals. Handle them with `page.once('dialog', …)` *before* the click,
  or Playwright auto-dismisses them and the flow looks like it silently did
  nothing.

## Scope

Not wired into the deploy — that edits `.github/workflows/deploy.yml`, which is
GAP-W2b ([#110](https://github.com/BarkernotBob/BarkernotBob.github.io/issues/110)).
When it is, add `tests/vehicle` alongside `tests/pool` and `tests/bank-bonus`.

Unlike the other two suites this one carries **no** deliberately known-failing
test. Vehicle has exactly one literal inline handler — `onclick="return false"`
on the CarEdge bookmarklet link, a constant that interpolates nothing — and every
real behaviour is bound in JavaScript with `.onclick=`. So the inline-handler
breakout class pinned in bank-bonus and pool does not exist here, and the
attribute hole it did have is closed. `security.spec.js` asserts that inline
count stays at one, which is what keeps GAP-W4
([#112](https://github.com/BarkernotBob/BarkernotBob.github.io/issues/112)) from
having to revisit this app.

## Running it

```bash
cd tests/vehicle
npm install
npx playwright install chromium   # skip where a browser is already provisioned
npx playwright test
```

The rig serves the repo's `quartz/` directory at the server root (port 5177), so
the app sits at `/static/vehicle/` exactly as it does live. Port 5177 keeps it
runnable alongside `tests/grocery` (5173), `tests/install-checks` (5174),
`tests/bank-bonus` (5175) and `tests/pool` (5176).

Where Chromium is already on disk, point at it instead of downloading one:

```bash
PW_CHROMIUM_PATH=/path/to/chromium npx playwright test
```
