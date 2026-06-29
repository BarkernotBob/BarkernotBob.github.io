# Bank Bonus Tracker — Status / Handoff

_Last updated: 2026-06-27_

This is a plain-language status note so you (or anyone helping) can pick the
project back up cold. No prior context needed.

---

## 1. The one-sentence summary

The Calendar data is populated, the **"Sign in with GitHub" button is live**
(Option A — OAuth App + Cloudflare Worker, no token to paste), and the **interface
overhaul is now done**: single-key keyboard shortcuts, dark mode, status pills,
person tags, a real month-grid Calendar, search/filter, and a direct "+ Add Account"
all shipped (sections 4 and 5). What's left is your eyes on it — verify it live.

---

## 2. What's done ✅ (this session)

1. **Calendar data populated.** Each account stores its direct-deposit schedule in
   a field called `ddPlan`. Every account had an empty one (`ddPlan: []`), so the
   Calendar had nothing to draw and showed "No DD planned yet."
   - Filled in `ddPlan` for **20 accounts**, matched on **both person and
     institution** (the data has two US Banks, two Citis, two Wells, and two
     Affinity FCUs across two people, so person alone wasn't enough).
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

## 4. Keyboard shortcuts — BUILT ✅

The app now has a global keyboard handler (`keydown` near the bottom of
`index.html`). It ignores keys while you're typing in a field or a dialog is open
(except `Esc`), so it never fights normal input. There's also a **⌨ button** in the
header and a `?` shortcut that pop up a cheat-sheet.

| Key | Does |
| --- | --- |
| `1`–`7` | Jump to Today / Active / Planned / Offers / Calendar / Reports / Settings |
| `n` | New — account (on Active/Planned) or offer (on Offers) |
| `s` | Save changes (inside an account) |
| `e` | Edit — focus the first field (inside an account) |
| `/` | Focus the search box (Active / Planned) |
| `Esc` | Close a dialog, or step back out of an account |
| `?` | Show the shortcuts cheat-sheet |

---

## 5. Interface overhaul — BUILT ✅

Every item from the old "rough edges" backlog shipped. All in the one file
`quartz/static/bank-bonus/index.html`:

- **Dark mode.** Auto-detects your system setting and a **🌙 / ☀️ toggle** in the
  header remembers your choice. The whole app runs on CSS theme variables.
- **App header bar** — title, who's signed in, theme + shortcuts buttons.
- **Status pills + colored card stripes.** `open` / `closed` / `planned` show as
  colored pills, and each account card carries a matching left stripe (green / grey /
  blue). The Calendar uses the same Full / Partial / Over coloring.
- **Person tags everywhere** — a colored initial dot + name on every card and table
  row, stable per person, so you can tell whose account is whose at a glance.
- **"+ Add Account" button** on Active and Planned (and in their empty states), so
  you no longer have to create an Offer and "Promote" it for a one-off account.
- **Search + person filter** on Active and Planned (and a person filter on the
  Reports "All accounts" table). Search box is reachable with `/`.
- **Real month-grid Calendar.** Replaces the flat table with a Sun–Sat month grid,
  payroll days colored by allocation status, today outlined, past days dimmed, plus a
  summary strip (total planned / upcoming / over-allocated) and a legend.
- **Reports polish** — a 4-stat summary strip up top, right-aligned tabular money,
  zebra rows, and sticky table headers.
- **Consistent delete confirms** — removing a reminder or a DD entry now asks first,
  matching the account-delete behavior.
- **Responsive + bigger touch targets** — rows reflow on narrow screens and buttons
  meet the ~44px tap size, so the phone layout isn't cramped.

> Verified headless (Chromium): all tabs render with no console errors, the month
> grid and pills draw, search/person filters work, theme toggles, and the `1`–`7` /
> `?` / `Esc` shortcuts fire. Still worth a quick look on the live site after deploy.

---

## 6. Key facts to not re-derive

- **Data repo:** `BarkernotBob/bank-bonus-data` (private) — holds `db/accounts.json`.
  Default branch `main`.
- **App repo:** `BarkernotBob/barkernotbob.github.io` (public) — holds the app code.
  Default branch `v5`. App file: `quartz/static/bank-bonus/index.html`.
- **`ddPlan` field shape:** array of `{ "payrollDate": "YYYY-MM-DD", "amount": <number> }`.
  Keep `payrollDate` in ISO (`YYYY-MM-DD`) — the app sorts/compares dates as text,
  so any other format breaks ordering.
- An account's `dates.firstDD` can legitimately differ from its first `ddPlan` date
  (e.g. a Huntington firstDD `2025-01-15` but first deposit landed
  `2025-01-10`). That's expected; don't "fix" it.
- Accounts not in the schedule had no DD requirement ($0) and keep `ddPlan: []`.
