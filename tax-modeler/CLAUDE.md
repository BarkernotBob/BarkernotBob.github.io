# Tax Modeler — project guide for Claude

A single-file, fully client-side US tax estimator and planning tool for **tax year 2026**
(federal + state, with **Indiana** modeled in full detail). Lives at `tax-modeler/index.html`.

> The repo-root `CLAUDE.md` also applies: the owner is a **coding/Git novice**. Explain
> changes in plain language, define jargon, and walk through steps. This file is the
> technical companion to that.

## What it does
- Estimates 2026 federal income tax (ordinary + LTCG brackets, AMT, NIIT, Additional
  Medicare, FICA, self-employment tax, QBI), the standard-vs-itemized choice, the major
  credits (CTC/ACTC, EITC, education AOTC/LLC, child & dependent care, Saver's, MCC),
  Social Security benefit taxation, and the ACA Premium Tax Credit. Reflects OBBBA (2025)
  2026 provisions.
- State: **federal-only** (default-safe), **Indiana** (state + all 92 counties, exemptions,
  renter/property deductions, 529 credit, state EIC, first-year child exemption),
  **no-income-tax states** ($0), or **any other state** via a flat-rate estimate.
- An **Optimize** tab: ranked savings "moves" (leaderboard), a lever explorer chart, an
  optimal-plan builder, "benefits within reach" (income-tested thresholds), a
  **side-business what-if** modeler, creative-moves tips, and an advanced-strategies explainer.
- A **Summary** tab: plain-English narrative, balance, income→tax waterfall (with
  click-to-expand rows), estimated-tax safe-harbor check, recommendations, cliffs/phase-outs.
- An **"Export for AI review"** button producing Markdown or JSON for a human/AI to sanity-check.

## File layout
- `tax-modeler/index.html` — **everything**: inline `<style>` and one big inline `<script>`.
  No build step, no dependencies, no network calls. Open the file in a browser to run it.
- `tax-modeler/tests/run.cjs` — Node regression suite (see Testing).

## Architecture (all inside the one `<script>`)
- **`C`** — the constants object (brackets, limits, phase-outs, Indiana data, etc.). Tax-law
  numbers live here. `COUNTIES` is a separate array of all 92 Indiana counties + rates.
- **`APP`** — `{taxYear, updated, sources}`. Single source of truth for the date stamp shown
  in the footer/methodology. Update `APP.updated` when refreshing figures.
- **`S`** — the live state object (all user inputs + UI state). Created via `loadState()`.
  `defaults()` returns a fresh state. `LS_KEY`/`SCHEMA` gate localStorage persistence; bump
  `SCHEMA` only if you change the shape in a way that should invalidate saved data (adding a
  new key does NOT require a bump — `loadState` merges new defaults over saved values).
- **`compute(s)`** — the pure tax engine. Takes a state object, returns a large result object
  `r` (agi, taxableIncome, fedIncomeTax, ssTax, medTax, seTax, credits, `r.indiana` = the
  generic **state** result, `totalTax`, `payments`, `balance`, `marginalOrd`, `adj` =
  adjustment line items, `ficaPaid`, etc.). No DOM access — this is why it's unit-testable.
- **`computeState(s, agi)`** — returns the state-tax object (kept on `r.indiana` for
  historical reasons even when not Indiana). Has `.kind` (`'IN'|'federal'|'notax'|'other'`),
  `.label`, `.isEstimate`. Indiana path computes exemptions/county/529/etc.
- **Rendering**: `renderForm()` builds the left input form; `renderResults()` →
  `renderSummaryTab(r)` / `renderOptimizeTab(r)` build the right pane. `refresh()` =
  `applyCaps(); applyVisibility(); updateAutoFields(); updateSubtotals(); renderResults()`.
  `renderResults()` calls `saveState()` (so every change persists).
- **Wiring**: `wireForm()` binds `[data-key]` inputs generically (checkbox/number/text/select).
  `wireOptimize()` binds the Optimize tab's controls. Most input changes call `refresh()`
  only; a few (`filingStatus`, `hsaFamily`, `state`) call `renderForm()` first because they
  add/remove fields.

## Key conventions / patterns
- **`[data-key]`** on a form control → auto-wired to `S[key]`. Use `field()` / `pairField()` /
  `check()` helpers to render inputs consistently.
- **Auto-estimated fields use a "touched" flag**: e.g. `acaBenchmarkOverride` +
  `acaBenchmarkTouched`, `ficaWithheld` + `ficaWithheldTouched`. `updateAutoFields()` keeps the
  displayed estimate live until the user edits it, and `compute` falls back to the computed
  estimate when not touched.
- **`planLevers(s)`** is the basis for the leaderboard, optimal plan, and opportunities "room".
  Each lever has `lowersIncome` — **529 is `false`** (it's a credit, not an income reduction),
  so it doesn't inflate the AGI-lowering "room". 401(k) levers require that person's wages;
  spousal IRA requires household earned income; SEP/Solo require SE profit.
- **Simple vs Detailed view** (`S.uiMode`): advanced form sections are tagged with classes
  `adv`, `advHealth`, `secIN` and **hidden via JS** after render (not via template `if`s —
  see Gotchas). Simple mode hides QBI/itemized/credits/ACA/Indiana-extras.
- **FICA is auto-counted as paid**: employee Social Security + Medicare is withheld
  automatically, so `compute` adds `ficaPaid` (defaults to computed `ssTax+medTax`) to
  `payments`. The "no withholding entered" warning keys off *income-tax* withholding only.
- **Safe harbor is federal-only** (`safeHarbor(s,r)`): under-$1,000 / 90%-of-this-year /
  100%(110%)-of-last-year. Uses `fedWithholding+fedEstimated` (NOT FICA).
- **Deadlines**: `deadlineFor(key,s)` → year-end (Dec 31) vs filing-deadline (Apr 15) chips on
  moves. Driven off `APP.taxYear`.

## Testing — run before every commit
```
node tax-modeler/tests/run.cjs
```
- The repo `package.json` has `"type": "module"`, so the test file is **`.cjs`** (CommonJS).
- The harness reads `index.html`, extracts the inline script, stubs a minimal DOM
  (`document`, `window`, `localStorage`, etc.), and `new Function(... ; return {compute, ...})`
  to expose internals. To test a new function, add it to that `return {...}` list.
- Tests assert **relationships/invariants** (e.g. AGI = income − adjustments, 529 caps at
  $1,500, no-tax state = $0, FICA in payments, loss reduces tax) rather than exact dollar
  amounts — robust against figure updates, still catches regressions. ~45 checks currently.
- There's no headless browser here; for render sanity I run ad-hoc Node snippets that stub the
  DOM and call `renderForm()` / `renderResults()` to confirm no throws.

## Gotchas (learned the hard way)
- **Apostrophes in single-quoted JS strings** break parsing (`'...state\'s...'` failed
  repeatedly). Avoid apostrophes in single-quoted strings, or use template literals/backticks.
- **Can't wrap form sections in inner template literals** to conditionally render them — the
  sections already contain nested backticks. Instead tag sections with a CSS class and toggle
  `display` in JS after `innerHTML` is set (that's why `adv`/`secIN` exist).
- **Re-rendering an input on every keystroke resets the cursor.** The side-business fields fixed
  this by updating only a sub-container (`#sbResult`) on input instead of re-rendering the whole
  pane. Apply the same approach for any in-results live inputs.
- **`r.indiana`** is the *generic* state object — don't assume Indiana. Gate Indiana-only display
  on `r.indiana.kind === 'IN'`.
- **Negative side-business net profit is intentional** (a deductible loss); it layers onto
  `otherOrdinary` (loss) vs `seNetProfit` (profit) so SE tax/QBI only apply to a profit.

## Tax-domain notes
- Year is **2026**; some figures are inflation-projected and may change — methodology panel and
  disclaimer say so. Keep figures in `C`, date in `APP`.
- **Not modeled** (stated in the methodology panel): states other than Indiana in detail; local
  taxes outside IN; part-year/multi-state; prior-year carryforwards; rental depreciation /
  passive activity / K-1 detail; the QBI wage/property limit is simplified; AMT is approximate;
  foreign income. It's an estimate, **not advice** — keep the disclaimer prominent.
- Indiana specifics that are easy to get wrong: additional dependent-child exemption is **$1,500,
  but $3,000 the first year a child is claimed** (per-dependent `firstYear` flag; IN IT Bulletin
  #117); 529 credit is **20% up to $1,500** ($750 MFS); renter deduction up to $3,000.

## Workflow
- Develop on branch **`claude/nifty-darwin-7y442n`**; commit with a clear message and push with
  `git push -u origin <branch>`. Don't open a PR unless asked.
- After a change: run the tests, then **deliver the file to the user via the chat** (they save it
  to iCloud/their device themselves — this is a sandboxed cloud container with no access to their
  local storage or iCloud). Work is also backed up in GitHub on the branch above.
- Privacy is a feature: the tool runs 100% in the browser and never transmits data. Don't add
  network calls, analytics, or external dependencies.
- Do not put the model identifier in commits, code, or any pushed artifact.
