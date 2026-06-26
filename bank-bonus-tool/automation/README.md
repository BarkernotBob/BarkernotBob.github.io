# Automatic daily email (the "robot")

This folder holds the **robot** that emails you each morning with today's bank bonus
actions — automatically, with no manual step.

- **What it is:** a GitHub Action (`daily-email.yml`) that lives in your **private data
  repo** (`bank-bonus-data`). Every day at 11:00 UTC (or whenever you configure it),
  the robot wakes up, reads your `db/accounts.json`, finds accounts to open/close and
  reminders due today, and sends you an email — **but only if there's something to do**
  (no "nothing today" spam emails).
- **What runs it:** GitHub's free servers. Nothing is hosted elsewhere; the robot runs
  inside your own GitHub account, and your data never leaves your private repo.
- **Cost:** Free (GitHub Actions free tier easily covers one email per day).

---

## One-time install (about 5 minutes)

You only need to do two things — add the robot file, and add your Gmail secrets.

### 1. Add the workflow to your data repo

1. Open your **`bank-bonus-data`** repo on GitHub.
2. Click **Add file ▸ Create new file**.
3. In the filename box, type exactly: `.github/workflows/daily-email.yml`  
   (the slashes create the folders automatically — this exact path is required).
4. Copy the entire contents of **`daily-email.yml`** (the file next to this README in
   `bank-bonus-tool/automation/`) and paste it in.
5. Click **Commit changes**.

### 2. Set up Gmail app password

The robot sends email via Gmail's SMTP. You'll create a one-time app password (not
your actual Gmail password).

1. Go to **https://myaccount.google.com/security** and scroll down to **App passwords**.
   *(If you don't see it, you may need to enable 2-factor authentication first.)*
2. **Select app:** Mail  
   **Select device:** Windows Computer (or whatever device name you want)
3. Click **Generate**.
4. Gmail will show a **16-character password** (with spaces, like `abcd efgh ijkl mnop`).
   Copy it exactly.

### 3. Add secrets to your data repo

1. In your `bank-bonus-data` repo, go to **Settings ▸ Secrets and variables ▸
   Actions**.
2. Click **New repository secret** and add three:

   | Name | Value |
   |---|---|
   | `MAIL_USERNAME` | your Gmail address (e.g., `isaiahmail97@gmail.com`) |
   | `MAIL_PASSWORD` | the 16-character app password from Step 2 (with spaces) |
   | `MAIL_TO` | the email to send daily reports to (can be same as `MAIL_USERNAME`) |

3. Click **Add secret** after each one.

---

## Testing the robot

1. Go to your `bank-bonus-data` repo.
2. Click the **Actions** tab.
3. On the left, click **Daily Bank Bonus Report** (the workflow name).
4. Click **Run workflow ▸ Run workflow**.
5. Wait ~30 seconds.
   - If you see a ✅ (green checkmark), it worked! Check your email inbox.
   - If you see a ❌ (red X), click it to see the error logs.

**Note:** if your account data has no actions due today (no reminders with today's date,
no accounts opening/closing), the robot will **skip sending an email**. This is
intentional — no "nothing today" spam. To test:
1. In the app, add a reminder to today's date on any account, or
2. Manually trigger the workflow (see above) to test the email setup.

---

## Adjusting the email time

By default, the robot sends at 11:00 UTC every day (which is 6:00 AM EST / 7:00 AM EDT).
To change it:

1. In your `bank-bonus-data` repo, open `.github/workflows/daily-email.yml`.
2. Find the line that says `- cron: '0 11 * * *'`.
3. Change it to your preferred time. The format is `'minute hour * * *'`:
   - `'0 14 * * *'` = 2:00 PM UTC
   - `'30 8 * * *'` = 8:30 AM UTC
   - (Use https://crontab.guru to experiment with times)
4. Commit and save.

---

## Troubleshooting

### Workflow fails with authentication error
- Double-check `MAIL_PASSWORD` was pasted exactly (including spaces).
- Confirm 2-factor authentication is enabled on your Gmail account.
- Try generating a new app password and updating the secret.

### Email doesn't arrive
- Check the **Actions** tab in your data repo. Click the failed job and expand the
  "Send email via Gmail" step to see the error.
- Confirm `MAIL_TO` is a valid email address.
- If the job says "No actions for today. Skipping email", add a reminder to today's
  date to generate an action, then re-run the workflow.

### Workflow not triggering at scheduled time
- GitHub Actions can be delayed by a few minutes. Wait 5–10 minutes past the cron time.
- Confirm your repo has had a commit in the last 60 days (GitHub disables Actions on
  inactive repos).
- In **Actions**, click **Daily Bank Bonus Report** and check the "Scheduled" tab to
  see the next run time.

---

## What the robot does (for the curious)

1. Reads `db/config.json` and `db/accounts.json` from your private repo.
2. Compares today's date against each account's:
   - `dates.opened` — accounts to open today
   - `dates.closed` — accounts to close today
   - `reminders[].date` — reminders due today (that aren't already `done`)
   - `dates.firstDD` — first DD that cleared yesterday
3. If there are any actions, builds an email and sends it via Gmail SMTP.
4. If there are no actions, exits silently (no email sent).

The whole thing runs in about 10 seconds.
