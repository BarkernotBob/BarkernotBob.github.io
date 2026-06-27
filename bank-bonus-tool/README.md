# 🏦 Bank Bonus Tracker

A web app for tracking bank account sign-up bonuses across multiple accounts and people.
Manage requirements, reminders, and direct-deposit scheduling all in one place.

**New here? Read [`SETUP.md`](./SETUP.md) first.**

## What it does
- 🎯 **Track active accounts** — each account on its own screen, no horizontal scrolling.
- 📋 **Offer backlog** — park researched banks, then one-click "Promote" to Planned or Open.
- 📅 **Direct-deposit scheduler** — allocate paycheck across accounts, flag over-allocation, override as needed.
- ⏰ **Unlimited reminders** — add reminders per account ("Transfer down", "Close before fee", etc.) with due dates.
- 📊 **Reports** — bonuses earned/pending/planned, ROI, effective APY, churn schedule.
- 🗓 **Today dashboard** — accounts to open/close today, reminders due today.
- 📧 **Daily email** — automated, fires only when there's something to do (no "nothing today" spam).
- 👥 **Multi-person** — track accounts for Isaiah, Grace, Business, or whoever.

## The three pieces
1. **The app** — `quartz/static/bank-bonus/index.html`. A single self-contained web page,
   served by your existing Quartz site at `/static/bank-bonus/`. Holds no data itself;
   talks to your private data repo via the GitHub API. Sign in with the **🔐 Sign in with
   GitHub** button (no token to paste — a shared OAuth App + Cloudflare Worker handle it);
   pasting a personal access token still works as a fallback under Settings → Advanced.
2. **The private data repo** — a separate, private GitHub repo (e.g. `bank-bonus-data`) that is
   the real database. Holds the JSON files (`db/*.json`). Only you can see it.
3. **The daily email** — a free scheduled GitHub Action (`daily-email.yml`) that runs each
   morning, checks for today's actions, and emails you only when there's something to do.

## Map of this folder
```
bank-bonus-tool/
├── README.md            ← you are here
├── SETUP.md             ← step-by-step first-time setup (start here)
├── SETUP-CHECKLIST.md   ← copy-paste checklist for setup
├── schema/
│   ├── README.md        ← every data field, explained
│   ├── config.json      ← example: your settings
│   ├── accounts.json    ← example: active/closed accounts
│   └── offers.json      ← example: offer backlog
└── automation/
    ├── daily-email.yml  ← copy this to your data repo
    └── README.md        ← 5-minute install walkthrough
```

The app lives at `quartz/static/bank-bonus/index.html` in this public repo, so your
website publishes it automatically.

## Data lives elsewhere (on purpose)
No account data is stored in this public website repo. It all lives in your **private**
`bank-bonus-data` repo. The files in `schema/` are just empty examples.

## Cost
$0. Free GitHub hosting + your existing Quartz site + your Gmail account. No paid API,
no subscriptions. The daily email uses GitHub Actions (free tier easily covers one
email per day).

## First time?
👉 **[Read `SETUP.md` to get started.](./SETUP.md)**
