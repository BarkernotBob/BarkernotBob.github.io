# Add "Sign in with GitHub" to your grocery app

This sets up the one-tap sign-in so you (or your wife, or any future device)
never have to hunt down and paste a token again. After this, signing in is:
**tap a button → approve a short code on GitHub → done.**

You do this setup **once**. It takes about 10 minutes. Nothing here costs money.

---

## A quick map of what we're building

Three pieces have to know about each other:

1. **A "sign-in app" on GitHub** — this is what pops up the "Authorize?" screen.
   It gives you one public ID code (the *Client ID*).
2. **A tiny helper** (the `worker.js` file next to this guide), put online for
   free on Cloudflare. The browser isn't allowed to talk to GitHub's sign-in
   system directly, so this helper passes the messages along. It holds **no
   secrets** and remembers nothing.
3. **Your grocery app**, which needs the two values from steps 1 and 2 pasted in.

Don't worry about the "why" — just follow the steps. None of these can charge
you or break your data.

---

## Step 1 — Create the sign-in app on GitHub (≈3 min)

1. Go to **github.com** and sign in.
2. Click your **photo** (top-right) → **Settings**.
3. Scroll down the left-hand list to **Developer settings** (very bottom).
4. Click **OAuth Apps** → **New OAuth App**.
5. Fill in:
   - **Application name:** `Grocery Tracker Sign-In` (any name is fine)
   - **Homepage URL:** the web address of your grocery app
     (e.g. `https://isaiahmail97-oss.github.io/static/grocery/`)
   - **Authorization callback URL:** paste the **same** web address again.
     (GitHub requires this box to be filled, but our sign-in style never uses
     it — so anything valid works.)
6. **Tick the box "Enable Device Flow."** ← this is the important one.
7. Click **Register application**.
8. On the next screen, copy the **Client ID** (looks like `Ov23li...` or
   `Iv1...`). **Paste it somewhere temporary — you'll hand it to me.**

> The Client ID is **not** a secret — it's safe to put in the app. (There's
> also a "client secret" button on that page — you do **not** need it. Ignore it.)

---

## Step 2 — Put the helper online for free (≈5 min)

1. Go to **cloudflare.com** and create a free account (or sign in).
2. In the left menu, click **Workers & Pages** → **Create application** →
   **Create Worker**.
3. Give it a name like `grocery-signin` and click **Deploy** (it deploys a
   default "Hello world" — that's fine, we replace it next).
4. Click **Edit code**.
5. Delete everything in the editor, then open the **`worker.js`** file that sits
   next to this guide, copy **all** of it, and paste it in.
6. Click **Deploy** (top-right).
7. Copy your worker's web address. It looks like
   `https://grocery-signin.YOURNAME.workers.dev`.
   **Paste it somewhere temporary — you'll hand it to me too.**

> Free tier is 100,000 requests a day. You'll use a handful. It will never cost
> anything.

---

## Step 3 — Hand me the two values

Send me, in chat:

- the **Client ID** from Step 1, and
- the **worker web address** from Step 2.

I'll paste them into the app (two lines near the top of the grocery page) and
publish. That's the only code change — and once it's in, the **"Sign in with
GitHub"** button appears automatically on every device.

> If you'd rather paste them yourself: open
> `quartz/static/grocery/index.html`, find `GH_CLIENT_ID` and `AUTH_PROXY` near
> the top, and put your two values between the quotes. Leave them blank and the
> button simply won't show (the old paste-a-token setup keeps working).

---

## Step 4 — Try it

1. Open the grocery app (refresh if it was already open).
2. On the setup screen you'll now see **"Sign in with GitHub."** Tap it.
3. A code appears (like `AB12-CD34`). Tap **Open GitHub & approve**, type/confirm
   the code, and press **Authorize**.
4. Come back to the app — it flips to **"✓ Signed in,"** fills the key for you,
   and you tap **Connect**. Done.

To add your wife's phone or your laptop later: just open the app there and tap
**Sign in with GitHub**. No token creation, no pasting.

---

## Honest notes (worth a 20-second read)

- **This does not stop a full "clear all browsing data" from logging you out.**
  Nothing can, on a site with no login server — clearing data wipes the exact
  spot the key is kept. What it *does* do is make getting back in a two-tap
  button instead of a token hunt.
- **What this sign-in can touch:** the GitHub "Authorize" screen will say it can
  access your repositories. That's how it writes to your `grocery-data` folder.
  If you ever want to cut it off, go to GitHub → Settings → Applications →
  **Authorized OAuth Apps** → revoke "Grocery Tracker Sign-In."
- **The helper holds no secrets.** It only relays GitHub's own sign-in messages.
  Even if someone found its web address, there's nothing there to steal.
