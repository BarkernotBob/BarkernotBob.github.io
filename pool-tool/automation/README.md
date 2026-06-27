# Pool Care — email reminders (the scheduled part)

The app already shows what's due whenever you open it (**📅 Today**). This piece
adds the **push**: an email when something is due, so you don't have to remember
to open the app. It's the last step and is set up after sign-in works.

There are two ways to send it. Pick one — I'll wire it up.

---

## Option A (recommended) — Scheduled Claude session  ⭐
Same pattern as your grocery tracker, and **no new passwords or secrets.**

- A Claude session runs on a timer (e.g. every morning).
- It reads `db/config.json` and `db/tests.json` from your private `pool-data`
  repo, works out what's **due** (using the same season + cadence rules the app
  uses), and emails you a short "here's what's due today" note plus any advice
  from your latest test.
- To turn it on, open a Claude session and say: **"set up my pool reminders."**
  You approve it once.

**Pros:** nothing new to configure, friendly wording, can include smart advice.
**Cons:** relies on your Claude subscription running the scheduled session.

---

## Option B — GitHub Action (self-contained, needs an email password)
A scheduled job that lives inside the `pool-data` repo and emails via your Gmail.

- Runs on GitHub's free schedule (cron), computes what's due, emails you.
- Needs a **Gmail App Password** (a 16-character code from your Google account)
  stored as a repo **secret** so the job can send mail. That's the one fiddly bit.

**Pros:** fully automatic, independent of Claude.
**Cons:** you create a Gmail App Password and add two repo secrets
(`MAIL_USERNAME`, `MAIL_PASSWORD`) once.

A ready-to-fill workflow template will be added here as
`pool-reminders.yml` when you choose Option B — it drops into
`pool-data/.github/workflows/`.

---

## How "due" is decided (both options use the same rules)
- Routine tasks come from `config.tasks[]`, each with a `cadence`
  (`weekly`, `biweekly`, `monthly`, `pump`) and a `last` date. Due when
  `today >= last + cadence`. `pump` = daily in peak summer, ~twice weekly
  otherwise.
- Tasks are paused **off-season** (outside `config.season.open`..`close`).
- Opening/closing get a heads-up in the ~3 weeks before `season.open` /
  `season.close`.
- The reminder email goes to `config.email` (set in the app's Settings).

Tell me which option you want and I'll build it.
