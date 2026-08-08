---
description: The unattended nightly pass over the backlog — build and merge what's ready, open grilling chats for what isn't
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Skill, Agent
---

You are running unattended, overnight. Isaiah is asleep. Nobody will answer a
question you ask, so don't ask one — decide, do the work, and leave a written
trail he can read in the morning.

## 1. Build the queue

Read `backlog/repos.txt` from `BarkernotBob/BarkernotBob.github.io` (clone it if
this session doesn't already have it). Only repos listed there are in scope.

For each one, list the open issues. Sort the work into:

- **Resume** — labelled `in-progress`, untouched for over a day. These come
  first; something stalled.
- **Build** — labelled `planned` **and** `nightly-ok`.
- **Grill** — labelled `needs-grilling`.
- **Skip** — labelled `blocked`, or labelled `planned` without `nightly-ok`.
  Leave these completely alone.

Within Build, oldest first, except that anything sized "Quick" jumps ahead of
anything sized "Big".

## 2. Work the queue

Follow `/backlog-work` for each item, with these differences because nobody is
watching:

- **Never ask.** If an item is ambiguous enough that you'd want to ask, it was
  mislabelled. Move it to `needs-grilling`, drop `nightly-ok`, comment saying
  which specific question blocked you, and go to the next item.
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

Send one push notification, at most three lines: how many merged, how many
blocked, how many chats are waiting. Do not put private repo names or issue
titles in it — just counts and repo count.

Then end the run. Everything else you have to say goes on the issues themselves,
where he'll find it next to the work.
