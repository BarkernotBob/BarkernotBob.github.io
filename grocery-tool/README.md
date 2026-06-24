# 🛒 Grocery Tracker

A private grocery + receipt tracker for two people, built to run on a Claude
subscription (no paid AI API) and free hosting (GitHub).

**New here? Read [`SETUP.md`](./SETUP.md) first.**

## What it does
- 📷 **In-app camera capture** of receipts (no copy-and-move).
- 🧾 **Structured database** of store, item, price, quantity for every line.
- 📋 **Flags unreadable details** for you to review (in-app list + email).
- 🥦 **Use-by estimates** for perishables, with a reminder on that date.
- 💙 **HSA-eligible flagging** with a reimbursement report.
- 📊 **Reports & search:** monthly spend, spend per store, spend per item over time.
- 🗑 **Waste tracking:** search an item and mark it thrown away.
- 🔁 **Smart grouping:** "GV WHL MLK", "whole milk", "Organic Whole Milk" → one item.

## The three pieces
1. **The app** — `quartz/static/grocery/index.html`. A single self-contained web
   page, served by your existing site at `/static/grocery/`. Holds no data itself;
   talks to your private data repo via the GitHub API using a token saved in the
   browser.
2. **The private data repo** — a separate, private GitHub repo (e.g.
   `grocery-data`) that is the real database. Holds receipt photos and the `db/*.json`
   files. Shared between you and your wife; invisible to the public.
3. **Claude (the engine)** — reads new receipt photos and fills the database
   following [`PROCESSOR.md`](./PROCESSOR.md). Runs on demand ("process my receipts")
   and on a weekly schedule.

## Map of this folder
```
grocery-tool/
├── README.md            ← you are here
├── SETUP.md             ← step-by-step first-time setup (start here)
├── PROCESSOR.md         ← the exact playbook Claude follows each run
├── reference/
│   ├── perishables.md   ← shelf-life table → use-by dates
│   └── hsa-eligible.md  ← HSA eligibility rules
└── schema/
    ├── README.md        ← every data field, explained
    └── *.json           ← example/template copies of the db files
```
The app lives separately at `quartz/static/grocery/index.html` so your website
publishes it automatically.

## Data lives elsewhere (on purpose)
No grocery data is stored in this public website repo. It all lives in the
**private** `grocery-data` repo. The files in `schema/` are just empty examples.

## Cost
$0. Free GitHub hosting + your existing Claude subscription. No paid API.
