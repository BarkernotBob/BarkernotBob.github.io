# 🏦 Bank Bonus Tracker

A web app for tracking bank account sign-up bonuses across multiple accounts and people.
Manage requirements, reminders, and direct-deposit scheduling all in one place.

**The app is local-first and free.** Open it, and it works immediately — no account, no
sign-in, no setup. Your data lives in your own browser and is never sent anywhere.
Syncing across devices is optional (see below).

**New here? Read [`SETUP.md`](./SETUP.md).**

## What it does
- 🎯 **Track active accounts** — each account on its own screen, no horizontal scrolling.
- 📋 **Offer backlog** — comes preloaded with a catalog of bank offers; one-click "Promote" to Planned or Open.
- 📅 **Direct-deposit scheduler** — allocate paycheck across accounts, flag over-allocation, override as needed.
- ⏰ **Unlimited reminders** — add reminders per account ("Transfer down", "Close before fee", etc.) with due dates.
- 📊 **Reports** — bonuses earned/pending/planned, ROI, effective APY, churn schedule.
- 🗓 **Today dashboard** — accounts to open/close today, reminders due today.
- 👥 **Multi-person** — track accounts for yourself, a partner, a business, or whoever.
- 💾 **Backup & restore** — export your data to a file and import it anywhere.
- 📲 **Installable** — add it to your Home Screen so it opens like a normal app and keeps your data safe.
- 🔔 **On-device reminders** — a free, private notification + app-icon badge for what's due, shown when you open the app.
- ☁️ **Optional sync** — connect your own private GitHub repo to sync across devices.
- 📧 **Optional daily email** — once synced, a free GitHub Action emails you when there's something to do.

## How your data is stored

**By default: this browser only.** Everything you enter is saved in your device's local
storage. Nothing leaves your device, there's no server, and no one — including whoever
hosts this page — can see your data. Use **Export backup** in Settings to keep a copy.

**Optional GitHub sync (bring your own token).** If you want the same data on your phone
and laptop, connect your *own* private GitHub repo in Settings. You paste a token that is
scoped to only that one repo and stored only in your browser; the app talks straight to
GitHub's API with no middle-man server. See [`SETUP.md`](./SETUP.md) for the 3-step setup.

## The pieces
1. **The app** — `quartz/static/bank-bonus/index.html` plus `starter-offers.js` (the
   preloaded offer catalog). A self-contained web page served at `/static/bank-bonus/`.
2. **Your browser's local storage** — the default database. No setup.
3. *(Optional)* **A private GitHub data repo** — only if you turn on sync. Holds your
   `db/*.json` files. Only you can see it.
4. *(Optional)* **The daily email** — a free scheduled GitHub Action (`daily-email.yml`)
   in that repo that emails you each morning only when there's something to do.

## Map of this folder
```
bank-bonus-tool/
├── README.md            ← you are here
├── SETUP.md             ← how to use it + optional sync setup (start here)
├── SETUP-CHECKLIST.md   ← copy-paste checklist for optional sync
├── schema/
│   ├── README.md        ← every data field, explained
│   ├── config.json      ← example: your settings
│   ├── accounts.json    ← example: active/closed accounts
│   └── offers.json      ← example: offer backlog
└── automation/
    ├── daily-email.yml  ← copy this to your data repo (optional)
    └── README.md        ← 5-minute install walkthrough
```

## Cost
$0. Local-first means no hosting and no API at all for the core app. Optional sync and
email ride on GitHub's free tier (one email per day is well within it).

## First time?
👉 **[Read `SETUP.md`.](./SETUP.md)**
