# Setup: Bank Bonus Tracker

## The 10-second version

**Just open the app.** It works immediately — no account, no sign-in, no setup. It opens
preloaded with a catalog of bank offers so you have something to work from right away.

Everything you do is saved automatically in your browser, on this device. That's it for
the basics. The rest of this page is optional.

---

## Install it (recommended — 20 seconds)

Installing makes the app open like a normal app, **keeps your data from being cleared**,
and is **required on iPhone** for reminders and the app-icon badge to work.

- **iPhone / iPad:** open this page in **Safari** → tap **Share** (the square with an ↑) →
  **Add to Home Screen** → **Add**. Open it from the new icon from now on.
  - *Why it matters:* a Safari **tab** can have its saved data — including your sync token —
    wiped after 7 days of no use. The installed Home Screen app is exempt, so your data and
    token stay put.
- **Android (Chrome):** tap the **⋮** menu → **Install app** → **Install**.
- **Desktop (Chrome / Edge):** click the **install icon** (a monitor with a ↓) at the right
  of the address bar → **Install**.

---

## Notifications — three ways, lowest-friction first

1. **On-device reminders (free, no account).** In **Settings ⚙️ → 🔔 Reminders on this
   device**, tap **Turn on notifications**. When you open the app, it puts a count on the
   app icon and shows a notification for anything due today. Works offline. On iPhone you
   must **install the app first** (above) — this never works in a plain Safari tab.
   *Caveat:* these appear **when you open the app**, not while it's closed.
2. **Daily email (reaches you while the app is closed).** Needs GitHub sync on plus a small
   one-time setup — see "Optional: daily email reminders" below.
3. **RSS feed.** Once synced, enable the feed in Settings and subscribe in any RSS reader.

---

## Using it day to day

1. **Offers tab** 📋 — the preloaded catalog of bank bonuses. Tap **Move to Planned** (you
   intend to open it) or **Open now** (you opened it today) on any bank to start tracking it.
2. **Active tab** 📂 — your open accounts, each on its own screen. Fill in dates, set up DD,
   tick off requirements.
3. **Planned tab** 🗒 — accounts you plan to open, with a target open date.
4. **Calendar tab** 📅 — schedule direct deposits across paydays (use **⚡ Auto-suggest**).
5. **Reports tab** 📊 — bonuses earned/pending, ROI, effective APY, churn schedule.
6. **Settings tab** ⚙️ — add the **People** you track, set your **paycheck schedule**, and
   **back up** your data.

> ⚠️ **Back up your data.** Because the default storage is your browser, clearing your
> browser history/cache erases it. In **Settings → Your data & sync**, tap **Export
> backup** now and then to download a `bank-bonus-backup.json` you can re-import anytime
> (or move to another device). Or turn on sync (below), which keeps a copy in your repo.

---

## Optional: sync across devices with GitHub

Want the same data on your phone *and* laptop? Connect your own private GitHub repository.
You do this **once per device**, and that device stays connected from then on. Your token
is stored only in your browser and talks directly to GitHub — there is no shared server
and no one else can see it.

**Estimated time: ~10 minutes the first time, ~1 minute on each additional device.**

### Step 1️⃣: Create a free GitHub account *(skip if you have one)*

Go to https://github.com/signup and follow the prompts. ("GitHub" is a free site that can
store your data file privately.)

### Step 2️⃣: Create your private data repo

1. Go to https://github.com/new
2. **Repository name:** `bank-bonus-data`
3. **Private:** ✅ (required — this keeps your data private)
4. Leave "Initialize this repository" unchecked.
5. Click **Create repository**. (A "repo" is just a private folder GitHub stores for you.)

### Step 3️⃣: Make a token scoped to *only* that repo

1. Go to https://github.com/settings/personal-access-tokens/new (Fine-grained token)
2. **Token name:** `bank-bonus-app`
3. **Expiration:** **No expiration** (so you never have to redo this on this device)
4. **Repository access:** **Only select repositories** → choose **`bank-bonus-data`**
5. **Permissions → Repository permissions:**
   - **Contents:** **Read and write** (lets the app sync your data)
   - **Actions:** **Read and write** (only needed if you want the in-app **Send test
     email** button to work — it triggers the email robot for you)
6. Click **Generate token**, then **copy it** (you only see it once).

This token can touch *only* your `bank-bonus-data` repo and nothing else in your account.

### Step 4️⃣: Connect the app

1. Open the app → **Settings** ⚙️ → **Your data & sync**.
2. Expand **☁️ Sync across devices with GitHub (optional)**.
3. **Data repo:** `your-username/bank-bonus-data`
4. **GitHub token:** paste the token from Step 3.
5. Tap **Connect & sync**.

The app validates the token, then:
- If your repo is **empty**, it uploads the data already on this device.
- If your repo **already has data** (e.g. you synced from another device), it loads that.

From now on every change saves to your repo. On a second device, just repeat Step 4 with
the same repo + a token, and your data appears.

> To stop syncing on a device, use **Disconnect** in Settings. Your repo keeps its data;
> the device switches back to its own local copy.

---

## Optional: daily email reminders

Once GitHub sync is on, you can get a morning email when there's something to do (open or
close an account, a reminder due, a DD cleared) — sent by a free GitHub Action in your
data repo. See [`automation/README.md`](./automation/README.md) for the 5-minute install.

---

## Troubleshooting

**"Could not connect" when turning on sync**
- Repo must be typed as `your-username/bank-bonus-data`.
- The token must have **Contents: Read and write** on that repo (Step 3).
- Make sure the repo exists and is spelled exactly.

**My data disappeared**
- If you were local-only and cleared your browser, local data is gone — restore from an
  **Export backup** file, or going forward turn on sync. If you were synced, reconnect in
  Settings (your data is safe in your repo).

**Accounts show as "Closed"**
- That's normal for old accounts you've closed. They're archived but still counted in
  Reports.
