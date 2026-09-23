# Your backlog — how it works

Every change you want made to any of your projects lives as one **issue** on
GitHub. An issue is just a numbered note attached to a project — a title, some
text, and a comment thread. That's all it is.

**Any open issue counts.** You never have to tag it, label it, or fill in a
form. If it's open, it's on your list and the nightly routine will build it.

Items live in the project they belong to, so the pool tool's list is in the pool
tool's repo and the website's list is in the website's repo. Nothing is mixed
together, but you can still see all of it in one view.

---

## Adding things — the main way

**Tell Claude, on your phone.** Open the Claude app and type or dictate:

> `/backlog-add` chlorine dose should show one decimal place, the pantry list
> jumps to the top when I tick something, and the home page cards feel cramped
> on my phone

That's three items in three different projects. Claude files them all, picks the
right project for each, and replies with a list of what it made. Dictation is
fine — it splits run-on sentences into separate items.

If something is half-baked, say so — "not sure about this one yet" — and it gets
flagged for a conversation instead of getting built.

You can also just say "add these to my backlog" without the slash command.

### The backup way

**https://barkernotbob.github.io/static/Backlog.html** — a small page on your own site.
No links point to it; you get there by bookmark.

First time you open it, paste your project list (one `owner/repo` per line).
That's stored in that browser only — it never leaves your phone.

After that: pick a project, type one item per line, tap **Add these**, then tap
**File it** on each. Each one opens GitHub's own new-issue screen with the text
already filled in — you just tap Submit.

Add it to your home screen: open it in Safari, tap the share button, then **Add
to Home Screen**.

### The GitHub app

Still works. Open the app → find the project → Issues → **+** → type a title and
hit send. No labels needed. It'll be on your list.

(Heads up: the GitHub phone app doesn't show the nice fill-in-the-blanks forms —
those only appear on a computer. It gives you a plain title-and-notes box
instead, which is fine.)

---

## Seeing the list

**On your phone**, three bookmarks:

| What        | Link                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Planned     | https://github.com/search?q=user%3ABarkernotBob+is%3Aissue+is%3Aopen+-label%3Ain-progress+-label%3Ablocked+-label%3Ahold&type=issues |
| In progress | https://github.com/search?q=user%3ABarkernotBob+is%3Aissue+is%3Aopen+label%3Ain-progress&type=issues                                 |
| Done        | https://github.com/search?q=user%3ABarkernotBob+is%3Aissue+is%3Aclosed&type=issues                                                   |

You must be **signed in** to github.com for these to show your private projects.
Signed out, GitHub only searches your public repos and the list looks empty.

Each result line tells you which project it belongs to. The same three links are
at the bottom of the Backlog page.

**In a Claude chat** — type `/backlog`. A table of every project with counts,
then the items, then a line on what needs your attention. Narrow it with a
project name: `/backlog pool`.

**On your Mac** — double-click **`Backlog.command`**. It writes `BACKLOG.md` in
your website folder and opens it, grouped by project. It's a normal note in your
Obsidian vault too. That file is a snapshot — typing in it does nothing.

---

## The labels

You never have to set these. Claude moves them as work happens. **No label at
all is the normal state** and means "planned".

| Label            | Means                                                          |
| ---------------- | -------------------------------------------------------------- |
| `in-progress`    | Being worked on right now                                      |
| `blocked`        | Stuck on something — the last comment says what                |
| `needs-grilling` | Too vague to build; needs a conversation                       |
| `hold`           | Parked on purpose. Still on your list, but nothing touches it  |
| `urgent`         | Do this first. The only one you might set yourself — see below |

**`urgent`** jumps an item to the front of the nightly queue, right after
anything already half-built. Add it from the GitHub app: open the issue → tap
**Labels** → pick `urgent`. When Claude files something that looks urgent, it
will suggest the label and add it if you reply "yes". Use it sparingly — if
everything is urgent, nothing is.

**Done** isn't a label. Done means the issue is closed.

Want to stop the nightly routine building something? Add `hold` to it, or just
say "put a hold on that one" in a Claude chat.

---

## What happens every night

At 2am a Claude session starts on its own, with no one watching, and:

1. Ranks everything open by impact: unfinished work first, then things that are
   broken, then things that unblock other items, then everyday improvements.
2. Builds three at a time, each by its own helper (a "sub-agent" — a separate
   Claude worker), and finishes all three before starting the next three. If the
   night runs out, at most three things are left half-done. Each comments on its
   issue as it goes — the plan first, then decisions and dead ends.
3. Opens a pull request, waits for the automated checks, and **merges it** once
   they're green. That was your call — it ships without asking.
4. Closes the issue with a **Manual test (for Isaiah)**: numbered plain-English
   steps so you can see the thing working yourself.
5. Keeps going until nothing buildable is left, or it runs out of budget. An
   item it gets cut off in the middle of stays `in-progress` and is resumed the
   next night.

It will not touch deploy workflows, secrets, or branch settings — those get
labelled `blocked` for you to handle awake.

**If an item is too vague, it does not guess.** It moves the item to
`needs-grilling` and writes down the exact question that stopped it on the
issue. Same for anything it had to label `blocked`. When the run finishes, it
leaves a **Questions for you** list at the end of that night's "Nightly backlog"
chat in your Claude app — tap the notification and every item's question is
there at once, numbered, each with a suggested answer. Answer the ones you can
in one reply. That's what makes it safe for a
one-line dictated note to be fair game.

You get one push notification with the counts. Everything else is written on the
issues, next to the work.

---

## Working an item yourself, during the day

In a Claude chat, in the right project:

- `/backlog-work 12` — pick up issue 12 and take it to done. No number given,
  it takes the oldest one.
- `/backlog-grill 12` — talk through a rough idea until it's buildable.
  Questions that don't depend on each other come together as a numbered list,
  each with a suggested answer. When it's pinned down, the item is ready for
  tonight.

Both leave the same trail on the issue as the nightly routine does, so there's
one history whether you did it or it did.

---

## Setup, once

1. On your Mac, in the website folder: `git pull`, then double-click
   **`Install Backlog System.command`**. It puts the labels on every project in
   `backlog/repos.txt`.
2. Sign in to github.com in Safari on your phone.
3. Bookmark the three links above, and https://barkernotbob.github.io/static/Backlog.html

## Adding a new project

Open `backlog/repos.txt`, add a line with `BarkernotBob/` and the repo name,
save, and double-click `Install Backlog System.command` again.

Only projects listed in that file are ever touched by the nightly routine.

---

## When something looks wrong

**The list looks empty on your phone.** You're signed out of github.com. Sign in
— signed out, only your two public projects are searchable.

**An item is `blocked`.** Read the last comment. It says what it needs from you.

**An item is `needs-grilling`.** There's a chat waiting in your Claude app, or
run `/backlog-grill <number>` yourself.

**`Backlog.command` says it couldn't read a project.** Either you're signed out
(`gh auth login` in Terminal) or the repo name in `backlog/repos.txt` is wrong.

**You want to stop the nightly routine entirely.** Ask Claude to disable the
backlog routine. It's a scheduled task on your account, not something running on
your Mac.
