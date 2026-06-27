# Setup Checklist — Live in 12 Minutes

**All data files are prepared.** You just need to upload them and connect the app.

> ⭐ **New easy sign-in:** the app now has a **🔐 Sign in with GitHub** button (the
> same one your Pool app uses). With it you can **skip Step 2 (the token)**.
> **One-time tweak first:** GitHub → **Settings → Developer settings → OAuth Apps** →
> open **Pool Care** → change **Authorization callback URL** from
> `https://barkernotbob.github.io/static/pool/` to
> `https://barkernotbob.github.io/static/` (delete `pool/`, keep the trailing slash)
> → **Update application.** Then in Step 4 just tap **Sign in with GitHub**.

---

## ✅ Step 1: Create Private Repo
**Time: 1 minute**

- [ ] Go to https://github.com/new
- [ ] Name: `bank-bonus-data`
- [ ] Privacy: ✅ **Private**
- [ ] Initialize: Leave blank
- [ ] Click **Create repository**

**Save this URL:** `https://github.com/YOUR_USERNAME/bank-bonus-data`

---

## ✅ Step 2: Generate GitHub Token
**Time: 2 minutes**

- [ ] Go to https://github.com/settings/tokens
- [ ] Click **Generate new token (classic)**
- [ ] Name: `bank-bonus-app`
- [ ] Expiration: 90 days (or longer)
- [ ] Scopes: ✅ `repo` only (nothing else)
- [ ] Click **Generate token**
- [ ] **Copy token immediately** (you only see it once!)

**Save this token:** `ghp_...` (in password manager or text file)

---

## ✅ Step 3: Upload JSON Files to GitHub
**Time: 5 minutes**

**In your `bank-bonus-data` repo:**

### 3a. Upload `db/config.json`
- [ ] Click **Add file → Create new file**
- [ ] Filename: `db/config.json`
- [ ] Open `bank-bonus-tool/SETUP-DATA-FILES.txt` (see below for content)
- [ ] Copy **File 1** content
- [ ] Paste into editor
- [ ] Click **Commit changes**

### 3b. Upload `db/offers.json`
- [ ] Click **Add file → Create new file**
- [ ] Filename: `db/offers.json`
- [ ] Copy **File 2** content: `[]`
- [ ] Paste into editor
- [ ] Click **Commit changes**

### 3c. Upload `db/accounts.json` (48 Accounts)
- [ ] In terminal, copy file:
  ```bash
  cat /tmp/claude-0/-home-user-BarkernotBob-github-io/087f99ff-c673-5a98-994c-4e1ef0c1e9f2/scratchpad/bank-bonus-data-db/accounts.json | pbcopy
  ```
  *(Linux: replace `pbcopy` with `xclip -selection clipboard`)*

- [ ] Go back to `bank-bonus-data` repo
- [ ] Click **Add file → Create new file**
- [ ] Filename: `db/accounts.json`
- [ ] Paste (Cmd+V / Ctrl+V)
- [ ] Click **Commit changes**

**Verify:** Repo now has three files in `db/` folder.

---

## ✅ Step 4: Connect App to Your Repo
**Time: 2 minutes**

**In your browser:**

- [ ] Open app: `http://localhost:8080/static/bank-bonus/` (or your live URL)
- [ ] Click **Settings** ⚙️ (bottom nav)
- [ ] Fill in:
  - **Data Repo:** `YOUR_USERNAME/bank-bonus-data` (e.g., `isaiahemail/bank-bonus-data`)
  - **GitHub Token:** Paste your token from Step 2
  - **Your Name:** Select **Isaiah**
- [ ] Click **Save Settings**

**Wait for confirmation:** "Settings saved and data loaded"

**Result:** Your 48 accounts should now appear on the **Active** tab.

---

## ✅ Step 5: Quick Test
**Time: 2 minutes**

- [ ] **Active** tab 📂 → Click any open account (e.g., Upgrade) → Detail view opens ✅
- [ ] **Planned** tab 🗒 → Click any planned account (e.g., Key Bank) → No opened date ✅
- [ ] **Calendar** tab 📅 → Pick an account → "Auto-suggest" fills DD-plan ✅
- [ ] **Reports** tab 📊 → Scroll down → See all 48 accounts with APY values ✅

---

## ✅ Step 6 (Optional): Daily Email
**Time: 5 minutes** (do now or skip, add later)

**If you want a morning summary:**

- [ ] Go to https://myaccount.google.com/apppasswords
- [ ] Generate Gmail app password
- [ ] Copy the 16-character password
- [ ] In `bank-bonus-data` repo, add `.github/workflows/daily-email.yml`
  - [ ] Click **Add file → Create new file**
  - [ ] Filename: `.github/workflows/daily-email.yml`
  - [ ] Request workflow file (I'll send separately)
  - [ ] Paste and commit
- [ ] Go to repo **Settings → Secrets and variables → Actions**
- [ ] Add three secrets:
  - [ ] `MAIL_USERNAME` = `isaiahmail97@gmail.com`
  - [ ] `MAIL_PASSWORD` = 16-char app password
  - [ ] `MAIL_TO` = `isaiahmail97@gmail.com`
- [ ] Test: **Actions** tab → Run workflow → wait 30s → check email

---

## 🎉 Done!

**Your Bank Bonus Tracker is now live with:**
- ✅ 48 migrated accounts from your spreadsheet
- ✅ Real-time sync to GitHub (all edits auto-saved)
- ✅ Full editor for accounts, reminders, dates, DD-plan
- ✅ Reports with after-tax bonuses and APY calculations
- ✅ Calendar with auto-suggest direct deposit allocation
- ✅ (Optional) Daily email every morning at 11 AM UTC

---

## 📋 Data Files Reference

See **`SETUP.md`** for File 1 and File 2 contents (config.json and offers.json).

File 3 (accounts.json) is copied from the terminal command above.
- [ ] App accessible at `/static/bank-bonus/`
- [ ] Can add/edit accounts
- [ ] Daily email configured (if you did Step 5)

---

**Stuck?** See the "Troubleshooting" section in [`SETUP.md`](./SETUP.md).
