# Pool Care — Setup Guide (start here)

Written for someone brand new to all this. One step at a time. You only do this
once. Total time ~20 minutes.

A quick map of the words you'll see:
- **Repository ("repo")** = a project folder stored on GitHub. Your website is
  one. We'll make a *second, private* one just for pool data.
- **Private** = only you (and anyone you invite) can see it.
- **OAuth App** = the thing that makes a real "Sign in with GitHub" button work.
- **Cloudflare Worker** = a tiny free helper that does the secure half of sign-in.
- **The app** = the page you open on your phone: `https://barkernotbob.github.io/static/pool/`

> **The token is the recommended way in** (see "Make your token" near the end), and
> it needs none of the Cloudflare steps. Steps 2–4 only set up the one-tap
> **Sign in with GitHub** button, which is the fallback — it asks GitHub for access
> to every private repo you own, so read "Why the token…" at the end first.

---

## Step 1 — Make the private "filing cabinet" (data repo)

1. Go to **https://github.com/new** (log in to GitHub if asked).
2. **Repository name:** type `pool-data`
3. Choose **Private** (important — keeps your pool data off the public web).
4. Tick **"Add a README file."**
5. Click **Create repository.**

✅ You now have an empty private folder at `your-username/pool-data`
(for example `BarkernotBob/pool-data`).

---

## Step 2 — Register the "Sign in with GitHub" app (OAuth App)

1. Go to **https://github.com/settings/developers** → **OAuth Apps** →
   **New OAuth App**.
2. Fill it in:
   - **Application name:** `Pool Care`
   - **Homepage URL:** `https://barkernotbob.github.io/static/pool/`
   - **Authorization callback URL:** `https://barkernotbob.github.io/static/`
     *(the trailing slash matters. Tip: use the parent `/static/` folder — not
     `/static/pool/` — so this one sign-in also covers the Grocery and Bank apps,
     which share it. If you already registered it as `/static/pool/`, just edit it
     to `/static/` and click **Update application**.)*
3. Click **Register application.**
4. On the next page:
   - Copy the **Client ID** (looks like `Iv1.abc123…`). Keep it handy.
   - Click **Generate a new client secret**, then **copy the secret** (a long
     string). You won't see it again — paste it somewhere safe for a few minutes.

> 🔒 The **secret** is sensitive. It goes ONLY into Cloudflare in Step 3 — never
> into the website, never into a repo, never sent to me in plain chat history.

---

## Step 3 — Deploy the Cloudflare Worker (the secure helper)

This is the one new piece. It's free.

1. Make a free account at **https://dash.cloudflare.com/sign-up** (if you don't
   have one).
2. In the dashboard left menu: **Workers & Pages** → **Create application** →
   **Create Worker**.
3. **Name** it `pool-auth` → **Deploy** (it deploys a placeholder).
4. Click **Edit code.** Delete everything in the editor, then paste the entire
   contents of **`pool-tool/worker/worker.js`** from this repo. Click **Deploy**.
5. Add your two secrets: go to the worker's **Settings → Variables and Secrets**
   (or **Settings → Variables**). Add two **Secret** (encrypted) variables:
   - `GITHUB_CLIENT_ID` = the Client ID from Step 2
   - `GITHUB_CLIENT_SECRET` = the secret from Step 2
   Click **Save and deploy.**
6. Copy the worker's URL — it looks like
   `https://pool-auth.your-subdomain.workers.dev`. Keep it handy.

✅ Test it: open that URL in a browser. It should say *"Pool Care auth worker is
running."*

---

## Step 4 — Tell the app its Client ID + Worker URL

The app needs to know two public values (the **Client ID** and the **Worker URL**).
These are not secret, but they live in the app's code.

**Easiest:** send me (Claude) a message with:
- your **Client ID** (`Iv1.…`)
- your **Worker URL** (`https://pool-auth.….workers.dev`)

and I'll drop them into `quartz/static/pool/index.html` (the `OAUTH` block near the
top) and publish. Done.

*(If you ever want to do it yourself: open that file, find the lines
`clientId: ''` and `workerUrl: ''` at the top, and paste the values between the
quotes.)*

---

## Step 5 — Publish the app (make it go live)

Your website is built from the **`main`** branch. These files were added on a working
branch. To make the app live at `https://barkernotbob.github.io/static/pool/`, the
branch needs to be **merged into `main`**. I'll open a pull request and walk you
through the merge — just say the word. (GitHub Pages takes ~5 minutes to rebuild.)

---

## Step 6 — Open the app and sign in

1. On your phone, open **https://barkernotbob.github.io/static/pool/**
2. Browser menu → **Add to Home Screen** so it feels like a real app.
3. Enter `your-username/pool-data` and the token you made below, then tap **Connect.**
   *(The one-tap **🔐 Sign in with GitHub** button is under "Other way in" — read
   ["Why the token, and not the one-tap button?"](#why-the-token-and-not-the-one-tap-button)
   before choosing it.)*
4. First time, it creates the data files in your `pool-data` folder automatically.

To use a second device (laptop, tablet), just sign in there too — there's no limit.

---

## Step 7 — Set your reminder email

1. In the app: **⚙︎ Settings → Reminder email** → type your email → **Save email.**
   (The default is your address; confirm it.)
2. The scheduled job that actually sends reminder emails is set up separately —
   see `pool-tool/automation/README.md`. Ask me: *"set up my pool reminders."*

---

## Using it day to day

- **📅 Today** — what's due now, plus advice from your latest test, plus
  open/close nudges in spring and fall.
- **🧪 Test** — log a test. Default is **test strips** (very low → very high per
  pad); switch to **Numbers** for an occasional in-depth lab test. It saves the
  reading and tells you exactly what to add.
- **✅ Schedule** — your recurring routine (chlorine, phosphate remover, pump,
  robot, basket, backwash) and the **opening / closing** checklists. Tap **Done**
  to reschedule the next reminder. Tap **Edit** to change any of it.
- **📈 History** — trends for each reading and a log of everything you've done.
- **⚙︎ Settings** — pool volume, target ranges, season dates, email, sign-out.

---

## Make your token (the recommended way in)

If you want to use the app today, before Steps 2–4:
1. Make a fine-grained token: **https://github.com/settings/tokens?type=beta** →
   **Generate new token** → name `pool app`, longest expiration, **Only select
   repositories → pool-data**, **Permissions → Contents → Read and write** →
   **Generate token** → copy it.
2. In the app's setup screen, enter `your-username/pool-data` and the token, then
   tap **Connect.**

Everything works the same; you just typed a key instead of clicking a button.
Once Cloudflare is set up, you can switch to the button anytime (Settings → Sign
out → Sign in with GitHub).

---

## If something goes wrong
- **Sign-in button says "not set up yet":** Steps 2–4 aren't finished, or the
  Client ID / Worker URL haven't been added to the app. Use the token fallback
  meanwhile.
- **App says 401 / 403:** your sign-in expired → Settings → Sign out → sign in
  again (or re-paste a token).
- **"Could not open that repository":** check the `owner/name` spelling in
  Settings matches your `pool-data` repo exactly.
- Stuck? Open a Claude session and describe what you see — I'll help.

---

## Why the token, and not the one-tap button?

Short version: **the token can be cut to open one door. The button can't.**

The **🔐 Sign in with GitHub** button uses an older style of GitHub sign-in whose only
repository setting is *all of them*. There is no way to tell it "just the pool
folder", so approving it hands the app access to **every private repository on your
account** — far more than it needs.

The fine-grained token above is the opposite: you tick exactly one repository, and
that is all it ever opens. Same app, same convenience after the first minute.

The button still works and is still there under **"Other way in"** — it is just no
longer the recommended route, and the app now says plainly what it is asking for
before you tap it.

**Already signed in with the button?** Nothing is broken and you don't have to redo
anything. When you have two spare minutes, make a token, then disconnect and
reconnect with it. You can withdraw the old access at
**https://github.com/settings/applications** → find the app → **Revoke**.
