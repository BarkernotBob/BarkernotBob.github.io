# Your backlog — how it works

Every change you want made to any of your projects lives as one **issue** on
GitHub. An issue is just a numbered note attached to a project — a title, some
text, and a comment thread. That's all it is.

You file them from your phone. Claude reads them, works them, writes notes on
them as it goes, and closes them when they're done. A routine runs every night
and builds whatever is ready.

Items live in the project they belong to, so the pool tool's list is in the pool
tool's repo and the website's list is in the website's repo. Nothing is mixed
together, but you can still see all of it in one view.

---

## One-time setup

**Step 1.** Double-click **`Install Backlog System.command`** in this folder.

It puts the two filing forms and the status labels on every project listed in
`backlog/repos.txt`, and installs the Claude commands. It takes about a minute
and prints a line per project. If it says `gh` isn't installed, open Terminal
and run `brew install gh`, then `gh auth login`, then try again.

**Step 2.** Install the GitHub app on your phone, from the App Store, and sign
in. That's how you'll file things.

**Step 3.** Bookmark this on your phone's home screen — it's the whole board:

https://github.com/search?q=user%3ABarkernotBob+is%3Aissue+is%3Aopen+label%3Aplanned&type=issues

In Safari, open that link, tap the share button, then **Add to Home Screen**.

That's it. Nothing else to configure.

---

## Filing something from your phone

Open the GitHub app → tap **Search** → type the project name → open it → tap
**Issues** → tap the **+** button.

You get two choices:

**Planned change** — you know what you want. It asks what you want changed, and
"Done when..." — how you'll know it worked. Anything filed this way is fair game
for the nightly routine to build and merge while you sleep.

**Rough idea** — you don't know yet. Just the idea and what's annoying you. The
nightly routine won't build these. Instead it opens a chat that asks you the
hard questions, and that chat is sitting in your Claude app waiting whenever you
next open it.

If in doubt, pick **Rough idea**. It costs nothing and the conversation will
sharpen it.

---

## Seeing the list

**On your phone** — the bookmark from Step 3. Three views:

| What        | Link                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| Planned     | https://github.com/search?q=user%3ABarkernotBob+is%3Aissue+is%3Aopen+label%3Aplanned&type=issues     |
| In progress | https://github.com/search?q=user%3ABarkernotBob+is%3Aissue+is%3Aopen+label%3Ain-progress&type=issues |
| Done        | https://github.com/search?q=user%3ABarkernotBob+is%3Aissue+is%3Aclosed+label%3Aplanned&type=issues   |

Each result line tells you which project it belongs to.

**In a Claude chat** — type `/backlog`. You get a table of every project with
counts, then the items, then a line on what needs your attention. Add a project
name to narrow it: `/backlog pool`.

**On your Mac** — double-click **`Backlog.command`**. It writes a `BACKLOG.md`
file in this folder and opens it, grouped by project, with Planned / In progress
/ Blocked / Done sections. It's also a normal note in your Obsidian vault, so
you can read it there.

That file is a snapshot, regenerated every time you run it. Typing into it does
nothing. To change an item, change the issue.

---

## The five labels

You never have to set these yourself. The forms set the first ones, and Claude
moves them as work happens.

| Label            | Means                                                   |
| ---------------- | ------------------------------------------------------- |
| `planned`        | Filed, not started                                      |
| `in-progress`    | Being worked on right now                               |
| `blocked`        | Stuck on something — the last comment says what         |
| `needs-grilling` | Too vague to build; needs a conversation                |
| `nightly-ok`     | The nightly routine may build and merge this unattended |

**Done** isn't a label. Done means the issue is closed.

Want to stop the nightly routine touching something? Open the issue on your
phone and remove the `nightly-ok` label. It stays on your planned list; the
routine skips it.

---

## What happens every night

A Claude session starts on its own, with no one watching, and:

1. Picks up anything left `in-progress` that stalled, then anything `planned`
   and `nightly-ok`, oldest first, small things before big things.
2. Builds one item at a time. Comments on the issue as it goes — the plan first,
   then decisions and dead ends, not a blow-by-blow.
3. Opens a pull request, waits for the automated checks, and **merges it** once
   they're green. That was your call — it ships without asking.
4. Closes the issue with a **Manual test (for Isaiah)**: numbered plain-English
   steps so you can see the thing working yourself.
5. Stops after five merges. Five unreviewed changes is already a lot to wake up
   to.

It will not touch deploy workflows, secrets, or branch settings — those get
labelled `blocked` for you to handle awake.

If an item turns out to be too vague once it starts, it doesn't guess. It moves
the item to `needs-grilling`, says which question stopped it, and opens a chat
about it.

You get one push notification with the counts. Everything else is written on the
issues, next to the work.

---

## Working an item yourself, during the day

In a Claude chat, in the right project:

- `/backlog-work 12` — pick up issue 12 and take it to done. No number given,
  it takes the oldest planned item.
- `/backlog-grill 12` — talk through a rough idea until it's buildable. Ask one
  question at a time. When it's pinned down, it rewrites the issue and marks it
  ready for tonight.

Both leave the same trail on the issue as the nightly routine does, so there's
one history whether you did it or it did.

---

## Adding a new project

Open `backlog/repos.txt` in this folder, add a line with `BarkernotBob/` and the
repo name, save, and double-click `Install Backlog System.command` again.

Only projects listed in that file are ever touched by the nightly routine.

---

## When something looks wrong

**An item sat in `planned` for weeks.** It's probably missing `nightly-ok` —
open it and check the labels. Rough ideas also sit there until you have the
grilling conversation.

**An item is `blocked`.** Read the last comment. It says what it needs from you.

**`Backlog.command` says it couldn't read a project.** Either you're signed out
(`gh auth login` in Terminal) or the repo name in `backlog/repos.txt` is wrong.

**You want to stop the nightly routine entirely.** Ask Claude to disable the
backlog routine. It's a scheduled task on your account, not something running on
your Mac.
