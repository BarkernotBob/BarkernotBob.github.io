# Grocery App — Project Status & Next Steps

> **Read this first when picking the project back up.** It's written to be
> understandable cold, with no memory of past chats. Plain language on purpose.
>
> **Last updated:** 2026-06-27

---

## 30-second summary

We added a **"Sign in with GitHub"** button to the grocery app so nobody ever
has to find and paste a secret token again. The code is **done and pushed**, but
**not yet switched on** — turning it on needs a small one-time setup (about 10
minutes) that only you can do, because it involves your GitHub and a free
Cloudflare account.

**Where it lives:** branch `claude/vigilant-bell-szzhxa`, open as **Pull Request #11**.

**Nothing is broken or live-changed yet.** The button stays hidden until two
values are filled in, so merging is safe and changes nothing visible.

---

## Important background you'll want to remember

- **Your repository was renamed** from `isaiahmail97-oss` to **`BarkernotBob`**.
  So your site and code now live under **`BarkernotBob.github.io`**. That rename
  is *why* the app made you sign in again a while back: your web address changed,
  and the browser stores the sign-in token per-address, so it looked empty at the
  new address. (Your data was never at risk — it lives in your GitHub repo, not
  the browser.)
- **Why we built the GitHub sign-in:** so an address change like that becomes a
  one-tap re-login instead of a "hunt down a new token" chore.
- **A key fact about tokens:** GitHub shows a token's value only once, when you
  create it. You can't look an old one up later. (The new sign-in avoids this
  whole problem.)

---

## What's been built (already pushed to PR #11)

1. **`quartz/static/grocery/index.html`** — the app itself. Added:
   - A **"Sign in with GitHub"** button on the first-run setup screen and in
     Settings (for refreshing the key).
   - The behind-the-scenes "device flow" sign-in (shows a short code → you
     approve on GitHub → app receives the key and saves it in the same spot the
     app already used, so everything else works unchanged).
   - The old **paste-a-token** method is kept as a fallback under "Advanced."
   - Two blank config slots near the top of the file: `GH_CLIENT_ID` and
     `AUTH_PROXY`. **While they're blank, the button stays hidden** and the app
     behaves exactly as before.
2. **`grocery-tool/signin/worker.js`** — the tiny "helper" program. A plain web
   page isn't allowed to talk to GitHub's sign-in system directly; this relays
   the messages. It holds **no secrets** and stores nothing. Runs free on
   Cloudflare.
3. **`grocery-tool/signin/SIGN-IN-SETUP.md`** — the step-by-step setup guide
   (the one-time task below).

---

## ▶️ NEXT STEPS — do these when you return (in order)

### Step 1 — Turn on the sign-in (one-time, ~10 min)
Follow **`grocery-tool/signin/SIGN-IN-SETUP.md`**. In short:
1. Create a **GitHub OAuth App** with **"Enable Device Flow"** ticked → copy its
   **Client ID**.
2. Put **`worker.js`** online via a **free Cloudflare account** → copy its **web
   address**.
3. **Send those two values to Claude**, who pastes them into the app's two config
   slots and publishes. (Or paste them yourself between the quotes on the
   `GH_CLIENT_ID` and `AUTH_PROXY` lines in `index.html`.)

### Step 2 — Test it
Open the app, tap **Sign in with GitHub**, approve the short code, confirm you're
in. Try it on a second device (e.g. your wife's phone) — should be just as easy.

### Step 3 — Merge PR #11
Once it works, merge the pull request so it becomes part of your live site.
(Ask Claude to walk you through merging if unsure.)

---

## The bigger roadmap (decided, not yet built)

**Goal you chose:** make the app usable by **"anyone with a GitHub account"** —
not just you, but not the no-account general public either. This is fully doable
on the current free/no-server design.

**To make stranger signup smooth, the planned next build is an auto-setup flow:**
- After a new person signs in, the app offers **"Set me up"** which, via the
  GitHub API, **auto-creates their private `grocery-data` repo, fills the starter
  files, and installs the receipt-reading robot** — so they don't do it by hand.
- They paste in **one AI key** and the app stores it for them (no fiddling with
  GitHub settings screens).

**The one cost/step that can't be removed:** the receipt-reading robot uses
Anthropic's AI, which **costs money per receipt** (pennies). For a shared app
that must be **each person's own AI key**, or the bill comes to you. So every
user gets their own key from Anthropic once.

**Notes for "sharing day":**
- For *your own* use, the robot is set up with a **Claude subscription login**.
  For *strangers*, a plain **Anthropic API key** is simpler to share — likely
  switch the shared version to that.
- More auto-setup = a **broader permission box** when people sign in. When you're
  truly ready to hand this to people you don't know, the clean upgrade is to turn
  the sign-in into a proper **"GitHub App"** that can touch *only* the grocery
  folder (friendlier, safer-looking). **Not needed for you + a few friends** —
  it's the "real public release" upgrade.

---

## Open decisions for next time

- [ ] Do the one-time sign-in setup (Step 1 above) — **the immediate blocker.**
- [ ] After it works, build the **"Set me up" auto-provisioning** flow?
- [ ] When/if going truly public: switch robot to **API key** + convert to a
      **GitHub App** for scoped permissions.

---

## Mini-glossary (plain language)

- **Repo / repository** — a folder of your stuff stored on GitHub.
- **Token / access key** — a secret password the app uses to read/write your
  data folder. The new sign-in fetches one for you automatically.
- **localStorage** — a notebook your browser keeps *per web address*. Holds your
  sign-in. Wiped if you clear browser data or the address changes.
- **OAuth / device flow** — the "Sign in with GitHub" handshake. "Device flow" is
  the variant that doesn't care about your web address (so domain changes don't
  break it).
- **Cloudflare Worker** — a tiny free program online; here it just relays GitHub
  sign-in messages. Holds no secrets.
- **PR / pull request** — a proposed set of changes you review before they go
  live. Ours is **#11**.
- **Branch** — a separate workspace for changes. Ours is
  `claude/vigilant-bell-szzhxa`.
