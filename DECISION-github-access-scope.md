# Decision: how the apps ask for access to your data repo

**Date:** 2026-08-28 · **Issue:** [#113 (GAP-W3)](https://github.com/BarkernotBob/BarkernotBob.github.io/issues/113) · **Audit ref:** `AUDIT-GAPS.md` GAP-W3, priority P1

## The problem

Signing in to the grocery or pool app sent GitHub `scope=repo`. That scope means
**full read and write access to every private repository on the account** — not the
one data repo the app actually uses. If that token ever leaked, from a lost phone or
a tampered page, it would hand over everything.

It matters more here than it would elsewhere: all four apps are served from the one
origin `barkernotbob.github.io`, so `gt_token`, `pl_token` and `bb_token` sit in the
same `localStorage` and any script running on any of these pages can read all of
them. (That exposure is [#112 (GAP-W4)](https://github.com/BarkernotBob/BarkernotBob.github.io/issues/112)'s
subject; this decision is about not making the stolen thing so valuable.)

## The decision

**Option (b): keep the existing sign-in, but make the recommended path a
fine-grained token restricted to the one data repo, and demote the broad
one-tap button to a clearly-labelled fallback.**

## Why not option (a) — a GitHub App on just the data repo

It is the better end state, and it is the reason this stays open as a possibility.
It was not chosen now because:

- It is a new registration, a new install-per-repo flow, and a rewrite of the
  Cloudflare Worker's token exchange — several moving parts, each able to lock the
  owner out of his own data if it goes wrong.
- It would force everyone already signed in to set up again. This issue explicitly
  requires that existing sign-ins keep working.
- Option (b) gets the security win — the recommended path grants access to exactly
  one repo — for a change that cannot break an existing session, because it touches
  only what the setup screen recommends, not how any stored token is used.

## Why the OAuth scope itself was not narrowed

Because it cannot be. The sign-in button is a **classic GitHub OAuth App**, and
classic OAuth Apps have exactly two repository scopes: `public_repo` (useless — the
data repos are private) and `repo` (everything). There is no per-repository scope to
downgrade to. Narrowing it is not a smaller version of option (a); it *is* option
(a).

So `scope=repo` is unchanged in the code. What changed is that it is no longer the
route the apps steer you toward, and the app now states plainly what it is asking
for before you tap it.

## What actually changed

- **grocery and pool setup screens:** the repo + fine-grained-token fields are now
  the primary form with a **Connect** button. "Sign in with GitHub" moved into a
  collapsed **"Other way in"** section that says, in plain words, that it asks for
  every private repository.
- **`grocery-tool/SETUP.md`, `grocery-tool/SETUP-CHECKLIST.md`, `pool-tool/SETUP.md`:**
  the token steps are the main path; each guide ends with a plain-English
  "why the key, and not the one-tap button?" section, including how to revoke old
  broad access.
- **Nothing about stored tokens or the sign-in code path changed.** Anyone already
  connected — by either route — stays connected.

## What was deliberately left alone

The audit is explicit that the Cloudflare Worker itself is well built: the client
secret stays server-side, the origin is locked down, nothing is stored. It was not
touched. The problem was never the Worker; it was the breadth of what was being
asked for.

## If you want option (a) later

Open a new issue for it. The pieces: register a GitHub App, install it on
`grocery-data` / `pool-data` only, swap the Worker's token exchange to the App's
installation-token flow, and give people a migration path that does not strand a
signed-in device. Until then, the fine-grained token is the least-access route and
is what the apps recommend.
