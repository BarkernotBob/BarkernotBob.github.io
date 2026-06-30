# ✅ Grocery Tracker — Click-Through Checklist

A short, do-it-in-order checklist. Tick each box as you go. Your specific values
are already filled in. Plain-language version of `SETUP.md`.

**Your values (copy these exactly):**
- Data folder name: **`grocery-data`**
- Full data folder address (you'll type this in the app): **`BarkernotBob/grocery-data`**
- App web address: **`https://barkernotbob.github.io/static/grocery/`**

> 💡 Steps 1, 2, and 3 work right now. Step 4 (opening the app) only works after
> the app is **published** — tell Claude **"publish it"** and it'll handle that.
> You can do Steps 1–3 first and publish anytime.

> ⭐ **New easy sign-in:** the app now has a **🔐 Sign in with GitHub** button (the
> same one your Pool app uses). With it you can **skip Steps 2 and 3 (the token)** —
> just do Step 1, then the one-time tweak below, then tap the button in Step 4.
>
> **One-time tweak (do once):** GitHub → **Settings → Developer settings → OAuth Apps**
> → open **Pool Care** → change **Authorization callback URL** from
> `https://barkernotbob.github.io/static/pool/` to
> `https://barkernotbob.github.io/static/` (delete `pool/`, keep the trailing slash)
> → **Update application.** Now the same sign-in works for grocery and bank too.

---

## ☐ STEP 1 — Make your private grocery folder

1. ☐ Open **https://github.com/new** (log in to GitHub if asked).
2. ☐ In **Repository name**, type:  `grocery-data`
3. ☐ Click **Private** (the round button). ← *don't skip this; it keeps receipts off the public web.*
4. ☐ Check the box **Add a README file.**
5. ☐ Click the green **Create repository** button.

✅ *Result:* you now have a private folder at `BarkernotBob/grocery-data`.

---

## ☐ STEP 2 — Invite your wife

1. ☐ In your new `grocery-data` folder, click **Settings** (top menu bar).
2. ☐ On the left, click **Collaborators**.
3. ☐ Click **Add people**.
4. ☐ Type your wife's GitHub username or email, then click to invite her.
   - *She needs a free account first:* **https://github.com/signup**
5. ☐ She opens her email/notifications and clicks **Accept invitation.**

✅ *Result:* you both share the same grocery data.

---

## ☐ STEP 3 — Make your access key (the "house key")

This is the fiddly one. Go slowly — it's just clicking.

1. ☐ Open **https://github.com/settings/tokens?type=beta**
2. ☐ Click **Generate new token.**
3. ☐ **Token name:** type  `grocery app`
4. ☐ **Expiration:** pick the longest option (e.g. **1 year**).
5. ☐ **Repository access:** click **Only select repositories**, then in the box pick **`grocery-data`**.
6. ☐ Click **Repository permissions** to open the list. Find **Contents** and set it to **Read and write.**
   - *(“Metadata: Read-only” will switch on by itself — that's normal, leave it.)*
   - *(Ignore every other permission.)*
7. ☐ Scroll to the bottom, click **Generate token.**
8. ☐ **Copy the token immediately** (it starts with `github_pat_…`). Paste it into your
   phone's Notes for a minute — **you can't see it again after you leave the page.**

✅ *Result:* you have a key that can open **only** your grocery folder.

> 🔒 Lost your phone later? Come back to this page, tap the `grocery app` token, and
> click **Revoke** — the key dies instantly and your data stays safe.

---

## ☐ STEP 4 — Connect the app (do this after it's published)

*(Tell Claude "publish it" first, then come back here.)*

1. ☐ On your phone, open **https://barkernotbob.github.io/static/grocery/**
2. ☐ Tap your browser's **Share / menu** → **Add to Home Screen** (makes it feel like a real app).
3. ☐ On the welcome screen:
   - **Your name:** choose **Me**
   - **Private data repository:** type  `BarkernotBob/grocery-data`
   - **Access key:** paste your token from Step 3
4. ☐ Tap **Connect.** (It sets up your data files automatically the first time.)

✅ *Result:* the app is live on your phone.

---

## ☐ STEP 5 — Set up your wife's phone

1. ☐ She makes her **own** access key by doing **Step 3** on her phone/computer
   (safer than sharing yours — but sharing yours also works in a pinch).
2. ☐ She opens the same app address, chooses **Wife** as the name, types the same
   `BarkernotBob/grocery-data`, pastes her key, taps **Connect.**

---

## ☐ STEP 6 — Add notification emails

1. ☐ In the app, tap **⚙︎ Settings.**
2. ☐ Under **Who gets notified**, type your email and your wife's email.
3. ☐ Tap **Save emails.**

---

## ☐ STEP 7 — Try it & let Claude read it

1. ☐ Tap **📷 Capture** and snap a receipt. It'll say "waiting for Claude."
2. ☐ Open a Claude session and say: **"process my receipts."**
3. ☐ Watch the items appear in **🔎 Search** and **📊 Reports.**
4. ☐ (Optional) Ask Claude: **"set up my weekly grocery processing"** for an
   automatic weekly catch-up.

---

### Quick troubleshooting
- **App says 401 / 403** → key is wrong or expired. Settings → re-paste, or remake (Step 3).
- **"Could not open that repository"** → check the spelling `BarkernotBob/grocery-data`.
- **Wife sees nothing** → she must Accept the invite (Step 2) and use the exact folder name.
- **Stuck anywhere** → open a Claude session, describe what's on your screen, and ask.
