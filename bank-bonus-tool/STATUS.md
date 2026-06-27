# Bank Bonus Tracker — Status / Handoff

_Last updated: 2026-06-27_

This is a plain-language status note so you (or anyone helping) can pick the
project back up cold. No prior context needed.

---

## 1. The one-sentence summary

The Calendar data is populated and the **"Sign in with GitHub" button is built and
live** (Option A — OAuth App + Cloudflare Worker — no token to paste). What's left
is **interface polish**: the **single-key keyboard shortcuts you asked for are still
not built**, and several UX/visual rough edges remain (sections 4 and 5).

---

## 2. What's done ✅ (this session)

1. **Calendar data populated.** Each account stores its direct-deposit schedule in
   a field called `ddPlan`. Every account had an empty one (`ddPlan: []`), so the
   Calendar had nothing to draw and showed "No DD planned yet."
   - Filled in `ddPlan` for **20 accounts**, matched on **both person and
     institution** (the data has two US Banks, two Citis, two Wells, and two
     Affinity FCUs across Grace/Isaiah, so person alone wasn't enough).
   - Totals **$31,425.55** across all planned deposits — matches the source sheet.
   - Lives in the **`bank-bonus-data`** repo → `db/accounts.json`, on the `main`
     branch. **Merged** (was PR #1).

2. **Default branch confirmed correct.** The `bank-bonus-data` repo's default
   branch was already `main` (the earlier handoff said it wasn't — that was out of
   date). The app reads `main`, which now holds the populated data. No action
   needed.

3. **Date display changed to MM/DD/YY.** The app now *shows* dates as MM/DD/YY
   (e.g. `06/27/26`) instead of the raw `2026-06-27`. Important detail: dates are
   still **stored** in the `YYYY-MM-DD` format the app needs for sorting — only the
   on-screen display changed. Lives in **`barkernotbob.github.io`** →
   `quartz/static/bank-bonus/index.html`, on the `v5` branch. **Merged**
   (was PR #12).

4. **Keyless "Sign in with GitHub" — DONE (Option A).** The token-paste step is no
   longer required. The app now has a **🔐 Sign in with GitHub** button: you approve
   on GitHub and come straight back signed in, no secret to copy.
   - Built as **Option A** from the old plan: a public GitHub **OAuth App** plus one
     tiny **Cloudflare Worker** that does the secret token-exchange. Both are
     **shared** with the Pool/Grocery apps — one OAuth App + one Worker cover all of
     `barkernotbob.github.io/static/*`.
   - In code (`index.html`): the `OAUTH` config object (`clientId`, `workerUrl`),
     `signInWithGitHub()`, `handleOAuthRedirect()` (the `/exchange` call), and
     `afterSignIn()`. Sign-in method is recorded in `bb_method` (`'oauth'` vs
     `'token'`).
   - The old token paste still exists as a **fallback**, tucked under
     "Advanced: paste a token instead" in Settings.
   - Setup docs (`SETUP.md`, `SETUP-CHECKLIST.md`) already describe this flow.

> Plain-language note on terms: a **repo** ("repository") is a project folder
> stored on GitHub. A **branch** is a parallel copy of the files you can change
> safely; **merging** copies those changes into the main copy. A **PR** ("pull
> request") is the review step before merging. "Default branch" is the copy the
> app reads by default.

---

## 3. What to check next 🔶 (quick verification)

- Open the app's **Calendar tab** and confirm the DD events now appear, including
  past ones, with dates reading as MM/DD/YY.
- The public site is served by GitHub Pages, which can take a couple of minutes to
  rebuild after a merge. If the Calendar is still empty after a refresh, that would
  be a new symptom worth investigating (the diagnosis was that empty `ddPlan` was
  the only cause, so it should now be populated).

---

## 4. Keyboard shortcuts — REQUESTED, NOT BUILT ⛔

You asked for **single-key keyboard shortcuts**. As of now the app has **none** —
the only `addEventListener` calls in `index.html` are for closing modals by click.
There is no `keydown`/`keyup` handler anywhere, so no key does anything. This is the
clearest outstanding gap.

### Suggested shortcut set (to build)
- **Tab switching:** `1`–`7` jump to Today / Active / Planned / Offers / Calendar /
  Reports / Settings (the nav order). Or `g` then a letter (`g a` = Active) if you
  prefer "go to" chords.
- **Create:** `n` = new offer on the Offers tab (and, in future, new account).
- **In the detail view:** `s` = Save Changes, `Esc` = Back, `e` = focus the first
  field.
- **Global:** `?` opens a small "keyboard shortcuts" help overlay; `Esc` always
  closes the open modal.

### How to build it (for whoever picks this up)
One `document.addEventListener('keydown', …)` near the init block at the bottom of
`index.html`. Guard it so it does nothing while the user is typing — i.e. bail if
`document.activeElement` is an `INPUT`, `TEXTAREA`, or `SELECT`, or a modal is open
(except `Esc`). Map keys to the existing `show('<tab>')` and the per-view action
functions (`addOffer()`, `saveAccountDetail()`, `backFromDetail()`), so it's wiring,
not new logic. Add a `?` help overlay using the existing `modal()` helper.

---

## 5. Where the interface is still rough 🔶 (UI / visual polish backlog)

The app works and is functional, but several edges are still un-friendly. Ranked
roughly by impact:

1. **No keyboard shortcuts at all** — see section 4. Biggest gap.
2. **No way to add an account directly.** You can only create accounts by adding an
   *Offer* then "Promote"-ing it. There's no "+ Add Account" button on Active or
   Planned. For a one-off account that detour is clunky.
3. **No empty-state guidance is actionable.** Empty tabs say "No active accounts
   yet." but offer no button to do something about it.
4. **No search / filter / sort.** Active, Reports, and the "All accounts" table have
   no way to filter by person or search by institution. With ~48 accounts the
   Reports table is a long unbroken scroll.
5. **No per-person split.** Config has `people: [Isaiah, Grace, Business]` but the
   lists don't group or color by person — you scan institution names to tell whose
   account is whose.
6. **Cards aren't clickably obvious.** Active cards open the detail view on click,
   but there's no cursor/hover cue saying so (Planned uses explicit buttons — the
   two tabs behave inconsistently).
7. **No undo / confirmation consistency.** Delete account asks twice; deleting a
   reminder or DD entry (the `×`) deletes instantly with no confirm.
8. **Calendar is a flat table, not a calendar.** It lists payroll dates in a table;
   it doesn't visually look like a month grid, and past vs upcoming aren't
   distinguished.
9. **Mobile/width:** `#main` is capped at 900px and the detail view packs three
   inputs per `.row` with no responsive collapse, so on a phone those rows get
   cramped.

### How the visuals could be optimized
- **Density & hierarchy:** the whole app is one flat `#f5f5f5` with white cards.
  Add a slim app header (title + who's signed in), and use color to encode *status*
  (green = open, grey = closed, blue = planned) on the cards and the Reports table —
  right now status is plain text.
- **Status pills instead of words.** Replace the bare `open`/`closed`/`planned` text
  with small colored pills; same for the Calendar `✅ Full / ⚪ Partial / ❌ Over`.
- **Sticky table headers + zebra rows** on the Reports "All accounts" table so it
  stays readable while scrolling 48 rows.
- **Person as a visual token** (initial chip or color dot) on every card/row.
- **Money emphasis:** right-align and bold dollar amounts in tables; show totals in
  a summary strip at the top of Reports rather than only in the table footer.
- **Dark-mode + system font scale** would match the rest of the Quartz site, which
  has a dark theme; the app is currently light-only.
- **Touch targets:** the tiny `Del` / `×` / 12px buttons are below the ~44px
  comfortable tap size on mobile.

These are independent and can be done in any order; **keyboard shortcuts (section 4)
is the one thing you explicitly asked for and the natural first pickup.**

### Where the relevant code lives
- All UI is in one file: `quartz/static/bank-bonus/index.html`. Styles are the
  `<style>` block at the top; each tab is a `render_<tab>()` function; navigation is
  `show('<tab>')`; modals use the `modal()` helper.

---

## 5. Key facts to not re-derive

- **Data repo:** `BarkernotBob/bank-bonus-data` (private) — holds `db/accounts.json`.
  Default branch `main`.
- **App repo:** `BarkernotBob/barkernotbob.github.io` (public) — holds the app code.
  Default branch `v5`. App file: `quartz/static/bank-bonus/index.html`.
- **`ddPlan` field shape:** array of `{ "payrollDate": "YYYY-MM-DD", "amount": <number> }`.
  Keep `payrollDate` in ISO (`YYYY-MM-DD`) — the app sorts/compares dates as text,
  so any other format breaks ordering.
- An account's `dates.firstDD` can legitimately differ from its first `ddPlan` date
  (e.g. Grace/Huntington firstDD `2024-12-27` but first deposit landed
  `2025-01-10`). That's expected; don't "fix" it.
- Accounts not in the schedule had no DD requirement ($0) and keep `ddPlan: []`.
