# Grocery Tracker — Setup Guide (start here)

This guide is written for someone brand new to all of this. Take it one step at a
time. Total time: about 10–15 minutes. You only do this once.

A quick map of the words you'll see:
- **Repository ("repo")** = a folder that lives on GitHub (the website that hosts
  your stuff). You already have one for your website. We'll make a *second, private*
  one just for grocery data.
- **Private** = only people you invite can see it. (Your website repo is public.)
- **Sign in with GitHub** = a one-tap button (the same kind you've used on other
  sites). This is the easy, recommended way to connect the app — no keys to copy.
- **Token** = a long secret password the app *can* use instead, if you prefer the
  manual route. Think of it as a house key you save on your phone. It's now the
  **fallback**, not the main path.
- **The app** = the web page you open on your phone to snap receipts and see reports.

---

## ⭐ The easy way: "Sign in with GitHub" (shared with your Pool app)

The grocery app now has a **🔐 Sign in with GitHub** button — the same sign-in your
**Pool** app already uses. Because it's shared, there's **nothing new to set up in
Cloudflare** and **no token to copy**. You only do **one** small one-time thing so
GitHub will allow the same sign-in to work on the grocery (and bank) pages too:

**One-time: widen the Pool sign-in to cover all your apps**
1. Go to **https://github.com/settings/developers** → **OAuth Apps** → open the one
   you made for Pool (it's named **Pool Care**).
2. Find **Authorization callback URL**. It currently says
   `https://barkernotbob.github.io/static/pool/`.
3. Change it to the parent folder so it covers every app:
   **`https://barkernotbob.github.io/static/`**
   *(just delete the `pool/` at the end — keep the trailing slash)*
4. Click **Update application.**

That's it. Pool keeps working exactly as before, and now Grocery and Bank can use the
**same** one-tap sign-in. (The Client ID and Worker URL are already baked into the
app — they're public, not secrets.)

Then go to **Step 4** below and use the **🔐 Sign in with GitHub** button. You only
need the token Steps (2–3) if you ever want the manual fallback.

---

## Step 1 — Make the private "filing cabinet" (data repo)

1. On a computer or phone browser, go to **https://github.com/new** (you may need
   to log in to GitHub first).
2. **Repository name:** type `grocery-data`
3. Choose **Private** (very important — this keeps your receipts off the public web).
4. Tick **“Add a README file.”** (This just makes sure the folder isn't empty.)
5. Click **Create repository.**

✅ You now have an empty, private folder at `your-username/grocery-data`.

---

## Step 2 — Invite your wife to the folder

So you both share the same data:
1. Open your new `grocery-data` repo → click **Settings** (top menu).
2. Left side → **Collaborators** → **Add people.**
3. Type your wife's GitHub username or email and invite her. (She'll need a free
   GitHub account: **https://github.com/signup**.)
4. She opens the email/notification and clicks **Accept invitation.**

---

## Step 3 — Make your access key (token)

This is the fiddliest step. Go slowly.

1. Go to **https://github.com/settings/tokens?type=beta**
   (that's: your GitHub **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens**).
2. Click **Generate new token.**
3. **Token name:** `grocery app`
4. **Expiration:** pick the longest option (e.g. 1 year). When it expires you'll
   just make a new one — I can remind you.
5. **Repository access:** choose **Only select repositories**, then pick
   **`grocery-data`**.
6. **Permissions** → **Repository permissions** → find **Contents** → set it to
   **Read and write.** (You can leave everything else alone. “Metadata: Read” turns
   on automatically — that's fine.)
7. Scroll down → **Generate token.**
8. **Copy the token now** (it starts with `github_pat_…`). You won't be able to see
   it again. Paste it somewhere safe for a minute (you'll put it in the app next).

> 🔒 The token is like a key to *only* this one grocery folder, and only to read/write
> files — nothing else on your account. If you ever lose your phone, come back to this
> page and click the token → **Revoke**, and it stops working instantly.

---

## Step 4 — Open the app and connect it

1. On your phone, open: **https://barkernotbob.github.io/static/grocery/**
   (This page goes live after these changes are published to your website — see
   "Publishing" at the bottom.)
2. Tap the browser menu → **Add to Home Screen** so it feels like a real app.
3. In the setup screen:
   - **Your name:** choose Me.
   - **Device name:** type a label like "My iPhone" (just so you can tell your
     devices apart).
   - Tap **🔐 Sign in with GitHub** → approve on GitHub → you land back in the app,
     signed in. The first time, it automatically creates the data files inside your
     `grocery-data` folder. Done!
4. *(Fallback only)* If you'd rather use a token, open **"Advanced: paste a token
   instead,"** type `your-username/grocery-data` and paste the token from Step 3,
   then tap **Connect with token.**

Repeat Step 4 on **your wife's phone**, choosing **Wife** as the name and tapping the
same **Sign in with GitHub** button (she approves with her own GitHub account).

### Staying signed in on several devices at once (phone *and* computer)

You can be signed in on as many devices as you like at the same time — your phone,
your laptop, a tablet. There is **no central login**: each device simply keeps its
own access key (token) saved in its own browser, and GitHub is happy to have many
keys working for the same account.

The one rule that matters:

- ✅ **Give each device its own token.** On the new device, make a *brand-new* token
  (Step 3) and paste that one in. A new token never disturbs your other devices.
- ❌ **Never press "Regenerate" on a token you're already using.** Regenerating
  changes that token's secret value, so the device still holding the old value
  suddenly stops working (it looks like it "got signed out"). If you ever need to
  replace a token, make a *new* one and update just that device — leave the others
  alone.

> Why this matters: in the past, reusing one token across devices and regenerating it
> was what kicked your phone off when you set things up on the computer. Separate
> tokens per device fixes that for good.

---

## Step 5 — Add notification emails

1. In the app, tap **⚙︎ Settings**.
2. Under **Who gets notified**, enter your email and your wife's email.
3. Tap **Save emails.**

Now Claude knows where to send review questions and freshness reminders.

---

## Step 6 — How receipts get read (the important part)

Snapping a photo only *saves* it. The reading is done by **Claude** (me), using your
Claude subscription — no paid service. Two ways it happens:

**A) You trigger it (anytime):**
   - Open a **Claude Code** session on your `grocery-data` repo (or this website repo).
   - Say: **“process my receipts.”**
   - I follow the playbook in `grocery-tool/PROCESSOR.md`: read each new photo, fill
     in items/prices, group similar names, estimate use-by dates, flag HSA items,
     flag anything I couldn't read, and email reminders.

**B) Automatic weekly catch-up:**
   - This is a **scheduled Claude session** that runs on its own (e.g. every Sunday
     night) and does exactly the same thing.
   - I can set this up for you — just ask: *"set up my weekly grocery processing."*
     (You'll approve it once.)

---

## Step 7 — Using it day to day

- **📷 Capture** — snap a receipt. That's it. It says "waiting for Claude."
- **🔎 Search** — find any item (similar names are grouped). Tap **🗑 Waste** to log
  something you threw away.
- **📊 Reports** — monthly spend, spend per store, top items, HSA reimbursement list,
  waste totals. Change the date range at the top.
- **📋 Review** — questions from Claude (things it couldn't read) and your freshness
  reminders. Tap **Still good / Used it / Threw away.**

---

## Publishing (making the app go live)

Your website is built from the **`main`** branch. The grocery app files were added on a
working branch called `claude/grocery-tracking-tool-0tep34`. To make the app live at
`https://barkernotbob.github.io/static/grocery/`, those changes need to be merged
into `main` (your live branch). I can walk you through that, or do it when you say so.
Until then, nothing is public and no data is exposed.

---

## If something goes wrong
- **App says 401 / 403:** your token is wrong or expired → Settings → re-paste, or make
  a new token (Step 3).
- **"Could not open that repository":** check the `owner/name` spelling exactly.
- **Wife can't see data:** make sure she accepted the collaborator invite (Step 2) and
  used the correct repository name.
- Stuck? Open a Claude session and describe what you see — I'll help.
