# Setup Checklist

## ✅ Just use it (no setup)

- [ ] Open the app at `/static/bank-bonus/`
- [ ] It loads preloaded with a catalog of bank offers
- [ ] **Settings** ⚙️ → add the **People** you track and your **paycheck schedule**
- [ ] **Offers** tab → tap **Move to Planned** / **Open now** on a bank to start tracking it

Your data saves automatically in this browser. Done.

- [ ] **Back it up:** Settings → **Export backup** (downloads `bank-bonus-backup.json`)

---

## 📲 Install + on-device reminders (recommended, free, no account)

- [ ] **Install it** (required on iPhone for reminders/badge, and keeps your data safe):
  - [ ] **iPhone/iPad:** Safari → **Share** ↑ → **Add to Home Screen** → **Add**, then open from the icon
  - [ ] **Android:** Chrome **⋮** → **Install app**
  - [ ] **Desktop:** address-bar **install icon** → **Install**
- [ ] **Turn on reminders:** Settings ⚙️ → **🔔 Reminders on this device** → **Turn on notifications**
- [ ] Now opening the app shows a badge + a notification for anything due today (works offline)

---

## ☁️ Optional: sync across devices (one-time, ~10 min)

**Time: 1 min** — Create a free GitHub account (skip if you have one)
- [ ] https://github.com/signup

**Time: 1 min** — Create your private data repo
- [ ] https://github.com/new
- [ ] Name: `bank-bonus-data`
- [ ] Privacy: ✅ **Private**
- [ ] Initialize: leave blank → **Create repository**

**Time: 2 min** — Make a token scoped to only that repo
- [ ] https://github.com/settings/personal-access-tokens/new
- [ ] **Expiration:** No expiration
- [ ] **Repository access:** Only select repositories → `bank-bonus-data`
- [ ] **Permissions → Contents:** Read and write
- [ ] **Permissions → Actions:** Read and write *(only if you want the in-app "Send test email" button)*
- [ ] **Generate token** → copy it (shown once)

**Time: 1 min** — Connect the app
- [ ] App → **Settings** ⚙️ → **Your data & sync** → expand **Sync across devices**
- [ ] **Data repo:** `your-username/bank-bonus-data`
- [ ] **GitHub token:** paste from above
- [ ] **Connect & sync**

**On any additional device:** repeat the last step with the same repo + a token.

---

## 📧 Optional: daily email (after sync is on)

- [ ] Generate a Gmail app password: https://myaccount.google.com/apppasswords
- [ ] In `bank-bonus-data`, add `.github/workflows/daily-email.yml`
      (copy from `bank-bonus-tool/automation/daily-email.yml`)
- [ ] Repo **Settings → Secrets and variables → Actions**, add:
  - [ ] `MAIL_USERNAME` = `you@example.com`
  - [ ] `MAIL_PASSWORD` = 16-char app password
  - [ ] `MAIL_TO` = `you@example.com`
- [ ] **Actions** tab → Run workflow → wait 30s → check email

See [`automation/README.md`](./automation/README.md) for details.

---

**Stuck?** See the "Troubleshooting" section in [`SETUP.md`](./SETUP.md).
