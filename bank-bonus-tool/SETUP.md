# Setup: Bank Bonus Tracker — Live Data Integration

**You're ~15 minutes away from a live, working app.** I've prepared all the data files. You only need to:

1. Create one private GitHub repo
2. Generate a token
3. Paste three JSON files and one workflow file
4. Tell the app where your data lives

That's it. **Estimated time: 12 minutes.** Do NOT do these steps until you have the data files ready — I'll prepare them after this guide.

---

## Step 1️⃣: Create Private Repo

**On GitHub.com:**

1. Go to https://github.com/new
2. **Repository name:** `bank-bonus-data`
3. **Description:** "Private data for Bank Bonus Tracker" (optional)
4. **Private:** ✅ Check this (required)
5. **Initialize with:** Leave unchecked
6. Click **Create repository**

**Done.** You now have an empty private repo.

---

## Step 2️⃣: Generate GitHub Token

This lets the app read/write your private data without storing your password.

**On GitHub.com:**

1. Go to https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. **Token name:** `bank-bonus-app`
4. **Expiration:** 90 days (or longer)
5. **Scopes:** Check only `repo`
6. Click **Generate token**
7. **Copy the token** (you can only see it once)

**Save it somewhere safe.** You'll need it in Step 5.

---

## Step 3️⃣: Upload `db/config.json`

I've pre-configured this with your paycheck ($1,930), timezone (America/New_York), and email. Don't edit it.

**On GitHub (in bank-bonus-data):**

1. Click **Add file → Create new file**
2. **Filename:** `db/config.json`
3. **Content:** I'll provide this below
4. Click **Commit changes**

---

## Step 4️⃣: Upload `db/accounts.json`

Your 48 migrated accounts with all dates, bonuses, reminders, and task flags.

**On GitHub:**

1. Click **Add file → Create new file**
2. **Filename:** `db/accounts.json`
3. **Content:** I'll provide this below (file is large, ~50KB)
4. Click **Commit changes**

---

## Step 5️⃣: Upload `db/offers.json`

Empty backlog, ready for future research.

**On GitHub:**

1. Click **Add file → Create new file**
2. **Filename:** `db/offers.json`
3. **Content:** `[]`
4. Click **Commit changes**

---

## Step 6️⃣: Upload Daily Email Workflow (Optional for now)

This sends a morning summary only when there's something to do. You can skip this and add it later.

**If you want daily emails:**

1. Click **Add file → Create new file**
2. **Filename:** `.github/workflows/daily-email.yml`
3. **Content:** I'll provide this below
4. Click **Commit changes**

**Then set three secrets** (repo Settings → Secrets and variables → Actions):
- `MAIL_USERNAME`: `isaiahmail97@gmail.com`
- `MAIL_PASSWORD`: [your Gmail app password](https://myaccount.google.com/apppasswords)
- `MAIL_TO`: `isaiahmail97@gmail.com`

---

## Step 7️⃣: Connect App to Your Repo

**In a browser:**

1. Open the app: `http://localhost:8080/static/bank-bonus/` (or your live URL)
2. Click **Settings** ⚙️ (bottom nav)
3. Enter:
   - **Data Repo:** `yourusername/bank-bonus-data`
   - **GitHub Token:** Paste the token from Step 2
   - **Your Name:** Select "Isaiah"
4. Click **Save Settings**

The app will test the connection. If successful, you'll see a message and your 48 accounts will load.

---

## Step 8️⃣: Quick Test

Try these flows to make sure everything works:

- **Active tab** 📂 → Click an account (e.g., Upgrade, Truist) → Verify fields load
- **Planned tab** 🗒 → Click a planned account (e.g., Key Bank) → Verify no opened date
- **Calendar tab** 📅 → Pick an open account → Click "Auto-suggest" → Should populate DD-plan
- **Reports tab** 📊 → Scroll down → Verify your 48 accounts are listed with APY values

If everything loads, **you're live.** ✅

---

## Data Files

I'll generate these files in a separate message. Copy each one and paste into GitHub as instructed above.

The files are:
1. `db/config.json` — your settings (paycheck, tax rate, timezone, email)
2. `db/accounts.json` — your 48 accounts (migrated from the spreadsheet)
3. `db/offers.json` — empty backlog
4. `.github/workflows/daily-email.yml` — optional daily summary (do later if you prefer)

---

## Troubleshooting

**"Settings saved but no data loaded"**
- Check repo name spelling: `yourusername/bank-bonus-data`
- Verify token in browser DevTools (F12 → Application → localStorage) shows the token you pasted
- Check that files exist in repo: `db/config.json`, `db/accounts.json`, `db/offers.json`

**"Token error / 401"**
- Token may have expired or been revoked. Generate a new one (Step 2) and re-enter it in Settings.

**"Accounts show as 'Inactive'"**
- This is normal for old closed accounts. They're archived but still tracked.

---

**Ready?** Once you confirm, I'll provide the three JSON files to copy-paste.
