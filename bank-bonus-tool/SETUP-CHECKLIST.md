# Setup Checklist

Quick reference. For details, see [`SETUP.md`](./SETUP.md).

## Before you start
- [ ] GitHub account (free)
- [ ] Gmail account
- [ ] This repo cloned

## Checklist

### Step 1: Create private data repo
- [ ] Created new **private** repo named `bank-bonus-data`
- [ ] Added a README (initial commit)
- [ ] Noted the repo URL: `https://github.com/YOUR_USERNAME/bank-bonus-data`

### Step 2: Initialize data files
- [ ] Created `db/config.json` with your paycheck, people, timezone, email
- [ ] Created `db/accounts.json` (copy from schema, or empty `[]`)
- [ ] Created `db/offers.json` (copy from schema, or empty `[]`)
- [ ] Committed and pushed

### Step 3: GitHub token
- [ ] Created Personal Access Token at https://github.com/settings/tokens/new
- [ ] Scopes: `repo` only
- [ ] Copied token (looks like `ghp_abc123…`)

### Step 4: Configure the app
- [ ] Built/served this website locally (`./Preview\ Website.command` or `npm run build && npx quartz build --serve`)
- [ ] Opened `http://localhost:8080/static/bank-bonus/`
- [ ] Went to **Settings** (⚙︎)
- [ ] Filled in:
  - Data repo: `YOUR_USERNAME/bank-bonus-data`
  - GitHub token: `ghp_abc123…`
  - Your name: (one of the people in config.json)
- [ ] Clicked **Save**
- [ ] Confirmed data loaded (should see accounts/offers on **Today** tab)

### Step 5: Daily email (optional)
- [ ] Created Gmail app password at https://myaccount.google.com/security (under **App passwords**)
- [ ] Copied 16-character app password
- [ ] In `bank-bonus-data` repo, created `.github/workflows/daily-email.yml` (copy from `bank-bonus-tool/automation/daily-email.yml`)
- [ ] Committed and pushed
- [ ] In `bank-bonus-data` Settings → Secrets and variables → Actions, added:
  - [ ] `MAIL_USERNAME` = your Gmail address
  - [ ] `MAIL_PASSWORD` = 16-character app password
  - [ ] `MAIL_TO` = email to receive daily report
- [ ] Tested workflow: **Actions** tab → **Run workflow** → check for green checkmark and incoming email

### Done!
- [ ] App accessible at `/static/bank-bonus/`
- [ ] Can add/edit accounts
- [ ] Daily email configured (if you did Step 5)

---

**Stuck?** See the "Troubleshooting" section in [`SETUP.md`](./SETUP.md).
