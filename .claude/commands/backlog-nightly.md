---
description: The unattended nightly pass over the backlog — build and merge what's ready, open grilling chats for what isn't
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Skill, Agent
---

You are running unattended, overnight. Isaiah is asleep. Nobody will answer a
question you ask, so don't ask one — decide, do the work, and leave a written
trail he can read in the morning.

## Reading and writing GitHub

There are two ways to reach GitHub and only one works in any given session:

- On Isaiah's Mac, the `gh` CLI is installed — use it.
- In a cloud session there is no `gh` — use the GitHub MCP tools (`mcp__github__*`).

Run `command -v gh` once at the start, pick the one that's there, and stick to
it. Every `gh ...` example below has a direct MCP equivalent.

## 1. Build the queue

Read `backlog/repos.txt` from `BarkernotBob/BarkernotBob.github.io` (clone it if
this session doesn't already have it). Only repos listed there are in scope.

### Reaching every repo

A cloud session is born holding exactly one repo and has to `add_repo` its way to
the rest. Those calls are sometimes refused by the session's own auto-mode
permission classifier — not by GitHub, and not per-repo. The same repo that is
refused in one run succeeds in the next, so a refusal tells you nothing about
that repository.

Two things measurably reduce it:

- **Attach one repo at a time.** Refusals cluster when several `add_repo` calls
  go out in one block. One or two at a time gets through far more often.
- **Retry a refusal once**, on its own. Repos refused inside a batch have gone
  through on an individual retry on more than one run.

Do not retry a second time, and do not go looking for another route in. Two
refusals means that repo is out of reach tonight; record it and keep going. A
single unreachable repo must never end the run.

Launching the session with all the repos already attached is not available:
`create_session` takes one `source_url`, singular. Runtime `add_repo` is the only
route, so this limitation is worked around rather than fixed.

### Keep a coverage ledger

As you go, record every repo in `repos.txt` under exactly one of three outcomes.
The third is the one that matters:

| Outcome         | Meaning                                       |
| --------------- | --------------------------------------------- |
| **read**        | Attached, issues listed, found work           |
| **empty**       | Attached, issues listed, nothing open to do   |
| **unreachable** | `add_repo` refused twice — _you never looked_ |

**Never collapse `empty` and `unreachable` into one number.** They look identical
in a summary that only counts issues found, and they mean opposite things: one is
a clean repo, the other is a blind spot. An issue filed from a phone into an
unreachable repo is invisible, and the whole point of this system is that filing
something never requires remembering anything.

If anything ends up `unreachable`, say so **by name** before you stop — see
step 4, which explains where the names go, since the notification can't carry
them.

For each repo you could read, list the open issues. **An open issue with no
label is work to do** — filing something must never require remembering to tag
it. Sort into:

Check Skip first — `blocked` and `hold` outrank everything, so an item that is
both `in-progress` and `blocked` is skipped, not resumed.

- **Skip** — labelled `blocked` or `hold`. Leave these completely alone.
- **Resume** — labelled `in-progress`, untouched for over a day. These come
  next; something stalled.
- **Grill** — labelled `needs-grilling`.
- **Build** — everything else that's open. This is the normal case and most
  items will land here.

Within Build, oldest first, except that anything sized "Quick" jumps ahead of
anything sized "Big".

Because nothing has to be tagged to qualify, some items will be thin — a single
dictated sentence with no acceptance criteria. That is expected, and step 2 says
what to do about it. Thin is not the same as unbuildable; judge each one on
whether you could state what "done" looks like without guessing at his intent.

## 2. Work the queue

Follow `/backlog-work` for each item, with these differences because nobody is
watching:

- **Never ask.** If an item is ambiguous enough that you'd want to ask, it isn't
  ready. Move it to `needs-grilling`, comment saying which specific question
  blocked you, and go to the next item. This is the safety valve that lets
  everything default to buildable — use it rather than guessing at intent.
  Building the wrong thing costs more than waiting a day.
- **Merge your own work** once CI is green. That is the standing instruction.
  Squash-merge, delete the branch.
- **Never merge on red CI.** Fix it, or if you can't, leave the PR open, label
  the issue `blocked`, comment why, move on.
- **Never touch, in any repo:** GitHub Actions workflow files, secrets,
  `.github/` permissions, branch protection, or anything under `.quartz/plugins/`.
  If an item needs one of those, label it `blocked` with a comment saying it
  needs a human, and move on.
- **One item at a time, start to finish.** Don't half-finish three things.
- Stop after 5 merged items, or when the queue is empty. Five merges unreviewed
  is already a lot to wake up to.

## 3. Open a grilling chat for each Grill item

For each `needs-grilling` item, use `create_session` to start a separate chat:

- **title:** `Grill: <issue title>`
- **tags:** `["backlog-grill"]`
- **prompt:** a standalone briefing — the repo and issue number, the full issue
  body, what you found when you looked at the relevant code, and the instruction
  to run the `/backlog-grill` protocol starting with the single most important
  question. Tell it to ask one question at a time and wait.

It sits in the Claude app until Isaiah opens it. Don't create a second chat for
an issue that already has one — check `list_sessions` with tag `backlog-grill`
against the titles first.

## 4. Report

Two audiences, and the split is deliberate: the notification is counts, the
issues carry the detail.

### The notification

One push notification, at most three lines: how many merged, how many blocked,
how many chats are waiting, and **coverage as a fraction** — `15/18 repos read`.
Do not put private repo names or issue titles in it — just counts.

Always send the coverage fraction, including on a night when everything was
reachable. `18/18` is a real result and takes one number; leaving it out when it
is clean means its absence is the only signal anything is wrong, and absence is
exactly what nobody notices.

### If any repo was unreachable

The fraction says _how many_; it can't say _which_, because names don't go in a
notification. So the names go on an issue, where they're durable and next to the
work:

1. Look for an open issue in `BarkernotBob/BarkernotBob.github.io` titled
   **`Nightly pass could not reach every repo`**.
2. If one exists, add a comment: tonight's date, the repos missed by name, and
   whether each was refused once or twice.
3. If none exists, file it with that exact title and label it **`hold`**.

`hold` is deliberate. This is a platform limitation, not buildable work — a
later pass that picked it up would try to build a fix for a classifier it
doesn't control. `hold` keeps it visible on the board and out of the queue.

Reuse the existing issue rather than filing a new one each night, or a bad week
produces seven issues saying the same thing.

### Never report a blind spot as a quiet night

A repo you could not attach has **unknown** contents, not empty ones. If the
queue came back empty, say which of the two it was:

- _"No open issues anywhere in scope"_ — only if coverage was complete.
- _"No open issues in the 15 repos I could read; 3 unreachable, listed on the
  coverage issue"_ — whenever it wasn't.

Then end the run. Everything else you have to say goes on the issues themselves,
where he'll find it next to the work.
