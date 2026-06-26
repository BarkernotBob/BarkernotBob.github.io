# Setup — First-time walkthrough

Setting up the Bank Bonus Tracker takes about **15 minutes** and a few one-time steps.
Follow them in order. Don't skip ahead — each step depends on the previous one.

## What you'll need
- A GitHub account (free)
- A Gmail account (for the daily email)
- This public repo already cloned to your machine (you're reading this in it!)

---

## Step 1: Create a private GitHub repo for your data

This is the "filing cabinet" that holds your account data. Only you can see it.

1. Go to https://github.com/new and create a **new private repository**.
2. **Name:** `bank-bonus-data` (or anything — just remember it).
3. **Private?** Yes, definitely.
4. **Initialize?** Add a README file (makes your first commit).
5. Click **Create repository**.

---

## Step 2: Create an initial commit with the data schema

You now have an empty repo. Let's add the JSON files. You can do this via GitHub's web
UI or the command line — pick whichever you prefer.

### Option A: GitHub web UI (easiest, no terminal)

1. In your new `bank-bonus-data` repo, click **Add file → Create new file**.
2. **Filename:** `db/config.json`  
   Copy the contents of `bank-bonus-tool/schema/config.json` from this repo and paste
   it in. (Replace the placeholder values with your actual paycheck, people, email,
   timezone.)
3. Click **Commit changes** (it will create the `db/` folder automatically).
4. Repeat for:
   - `db/accounts.json` (copy from `bank-bonus-tool/schema/accounts.json`)
   - `db/offers.json` (copy from `bank-bonus-tool/schema/offers.json`)

### Option B: Command line (if you're comfortable with git)

```bash
# Clone your new repo
git clone https://github.com/YOUR_USERNAME/bank-bonus-data
cd bank-bonus-data

# Copy the schema files
mkdir db
cp ../BarkernotBob.github.io/bank-bonus-tool/schema/config.json db/
cp ../BarkernotBob.github.io/bank-bonus-tool/schema/accounts.json db/
cp ../BarkernotBob.github.io/bank-bonus-tool/schema/offers.json db/

# Edit config.json with your actual paycheck/timezone/email
nano db/config.json

# Commit and push
git add db/
git commit -m "Initialize database schema"
git push
```

---

## Step 3: Get a GitHub Personal Access Token

The app uses this token to read/write your data repo.

1. Go to https://github.com/settings/tokens/new
2. **Token name:** `bank-bonus-token` (or anything)
3. **Expiration:** 90 days (or never, if you prefer)
4. **Scopes:** check only `repo` (full control of private repositories)
5. Click **Generate token**.
6. **Copy it** — it looks like `ghp_abc123def456…`. Save it somewhere safe (password manager
   is fine). You'll use it in the next step.

*(Note: GitHub only shows the token once. If you lose it, delete it and create a new
one.)*

---

## Step 4: Configure the app (in your browser)

Now you have data and a token. Let's tell the app where they are.

1. **Build and serve this website locally.** Run one of:
   - `./Preview\ Website.command` (Mac/Linux), or
   - `npm run build && npx quartz build --serve` (any OS), or
   - if you're already serving it, just open it in your browser.

2. Navigate to **`http://localhost:8080/static/bank-bonus/`** (or wherever your site is).

3. Click **Settings** (⚙︎ button at the bottom).

4. **Configure once:**
   - **Data repo:** `YOUR_USERNAME/bank-bonus-data` (e.g., `isaiahemail/bank-bonus-data`)
   - **GitHub token:** paste the token you created in Step 3
   - **Your name:** pick one of the people in your `config.json` (e.g., `Isaiah`)
   - Click **Save**.

5. The app will fetch your data from GitHub. If it works, you'll see your accounts and
   offers on the **Today** tab. If it fails, check the browser console (F12 → Console
   tab) for error messages.

---

## Step 5: Set up the daily email (optional, but recommended)

The daily email fires every morning at 11 AM UTC, but only sends if there's something
to do (accounts to open/close, reminders due).

### 5a. Create a Gmail app password

The email workflow uses Gmail's SMTP. You'll create a one-time app password (not your
actual Gmail password).

1. Go to **https://myaccount.google.com/security** and scroll down to **App passwords**
   (you may need to enable 2-factor auth first).
2. **Select app:** Mail  
   **Select device:** Windows Computer (or whatever)
3. Click **Generate**.
4. Gmail will show a **16-character password** (spaces included). Copy it.

### 5b. Add the workflow to your data repo

1. In your `bank-bonus-data` repo on GitHub, click **Add file → Create new file**.
2. **Filename:** `.github/workflows/daily-email.yml`  
   Copy the entire contents of `bank-bonus-tool/automation/daily-email.yml` from this
   repo and paste it in.
3. Click **Commit changes**.

### 5c. Add repo secrets

1. In your `bank-bonus-data` repo, go to **Settings → Secrets and variables → Actions**.
2. Click **New repository secret** and add three:

   | Name | Value |
   |---|---|
   | `MAIL_USERNAME` | your Gmail address (e.g., `isaiahmail97@gmail.com`) |
   | `MAIL_PASSWORD` | the 16-character app password from Step 5a (spaces and all) |
   | `MAIL_TO` | the email to send the daily email to (same as `MAIL_USERNAME` is fine) |

3. Click **Add secret** after each.

### 5d. Test it

1. In your repo, go to **Actions** tab.
2. Click **Daily Bank Bonus Report** (or whatever the workflow is named).
3. Click **Run workflow → Run workflow**.
4. Wait ~30 seconds. You should see a green checkmark and receive a test email.

If the email doesn't arrive or the job fails, check the job logs (**Actions** → click
the failed job → expand the "Email" step) for error messages.

---

## Step 6: You're done! 🎉

You can now:
- **Open the app** at `/static/bank-bonus/` anytime.
- **Add offers** to the backlog on the **Offers** tab.
- **Promote** an offer to Planned or Open (one click).
- **Track reminders** per account.
- **View today's actions** on the **Today** tab.
- **Review reports** on the **Reports** tab.

The daily email will send each morning at 11 AM UTC (you can change the time in the
`.github/workflows/daily-email.yml` file, line with `cron:`).

---

## Troubleshooting

### "Can't fetch data from GitHub"
- Check your repo name and GitHub token in **Settings**.
- Confirm the token has `repo` scope (see Step 3).
- Confirm `db/config.json`, `db/accounts.json`, and `db/offers.json` exist in your
  data repo.

### "Email not arriving"
- Check **Actions** tab in your data repo for failed workflows.
- Confirm Gmail app password was created correctly (Step 5a).
- Confirm secrets are spelled correctly (Step 5c).
- If it says "Nothing to do", the email is suppressed (as intended) — add a reminder
  to today's date to test.

### "Can't find settings / app won't load"
- Make sure you're accessing `/static/bank-bonus/` (not `/static/grocery/`).
- Clear your browser cache (Cmd+Shift+Delete on Mac, Ctrl+Shift+Delete on PC).
- Check the browser console (F12 → Console) for errors.

---

## Next steps

Once you're comfortable with the app, you may want to:
1. **Migrate your data** from the old Google Sheet (documented separately).
2. **Promote offers** to active accounts as you're ready to open them.
3. **Adjust the email time** in `.github/workflows/daily-email.yml` (line with `cron:`).
4. **Share the app** with Grace or others (just give them the `/static/bank-bonus/`
   link; they'll set their own token + repo in Settings).

See [`SETUP-CHECKLIST.md`](./SETUP-CHECKLIST.md) for a copy-paste checklist.
