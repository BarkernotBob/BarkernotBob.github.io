# Bank Bonus Tracker — Status / Handoff

_Last updated: 2026-06-27_

This is a plain-language status note so you (or anyone helping) can pick the
project back up cold. No prior context needed.

---

## 1. The one-sentence summary

The Calendar tab was empty because of missing **data**, not a code bug. That data
is now filled in and merged. The app should show the Calendar events. The next
thing you wanted to explore is a **simpler sign-in** that doesn't make you paste a
GitHub token — and that piece is **not built yet** (details in section 4).

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

## 4. The next feature you wanted: simpler / keyless sign-in 🔵

**Reality check first:** you mentioned wanting a simpler sign-in "like the grocery
tracker, where a private key is not needed." Both apps actually work the **same
way** today — they each ask you to paste a **GitHub personal access token** (a long
secret string, like `github_pat_…`) into Settings, and store it in your browser.
The grocery tracker only *looks* friendlier: it calls the token an "access key…
like a house key" and lets you name each device. Mechanically it's the same token.
So **a truly keyless sign-in does not exist in either app yet** — it's new work.

### Why it's not trivial
The apps are **static pages** (just HTML/JavaScript, no server of their own). They
talk straight to GitHub's API using your token. A "real" sign-in button — where you
click "Sign in with GitHub," approve, and never see a token — needs one of these,
because the secure GitHub sign-in flows can't be completed safely by a page with no
backend:

- **Option A — GitHub OAuth App + a tiny serverless function.** You'd add a small
  cloud function (e.g. Cloudflare Workers / Netlify / Vercel free tier) that holds
  the app's secret and does the token exchange. Result: a clean "Sign in with
  GitHub" button, no token pasting. Most work, best experience.
- **Option B — GitHub Device Flow.** Shows a short code and a github.com link to
  approve on your phone. Friendlier than pasting a token, but GitHub's device-flow
  endpoint still needs a small proxy (CORS), so it also implies a minimal backend.
- **Option C — Keep the token, polish the wording only.** No backend. Lowest
  effort; this is essentially what the grocery tracker already did. Doesn't remove
  the token, just makes it less scary.

### Recommendation
If the goal is genuinely "no key to paste," **Option A** is the right target, and
it's a shared piece both the bank-bonus and grocery apps could reuse. Decision to
make when you return: are you willing to run a tiny free serverless function? If
yes → Option A. If you want zero infrastructure → Option C is all that's possible.

### Where the sign-in code lives (for whoever builds it)
- Bank app: `quartz/static/bank-bonus/index.html` — see the `LS` settings object
  (`bb_repo`, `bb_token`, `bb_me`) and `ghHeaders()` (`Authorization: Bearer …`).
- Grocery app: `quartz/static/grocery/index.html` — same shape (`gt_repo`,
  `gt_token`, `gt_me`, plus `gt_device` for per-device naming).
- Both send the token on every request to `https://api.github.com`.

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
