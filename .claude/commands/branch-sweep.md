---
description: Monthly sweep for abandoned branches — delete what has already landed, ask about the rest
allowed-tools: Bash, Read, Write, Glob, Grep
---

Find work that was built, paid for, and then quietly left on a branch nobody
ever decided about. Fifteen branches went that way between June and August 2026;
this exists so it doesn't happen again.

You may be running unattended. **Never delete a branch that still holds work.**
Deleting something already merged is housekeeping. Deleting something unmerged
destroys the only copy.

## Reading and writing GitHub

Two ways to reach GitHub, and only one works in any given session:

- On Isaiah's Mac, the `gh` CLI is installed — use it.
- In a cloud session there is no `gh` — use the GitHub MCP tools (`mcp__github__*`).

Run `command -v gh` once at the start, pick the one that's there, stick to it.

## 1. Build the list

`backlog/repos.txt` in `BarkernotBob/BarkernotBob.github.io` is the list of
projects in scope. Nothing outside it may be touched. For each repo, list every
branch that is not the default branch, and for each one record:

- when it was last committed to
- how many commits it has that the default branch does not
- whether an open or merged PR references it

## 2. Sort each branch into exactly one bucket

**Already landed** — every commit on it is reachable from the default branch.
Check this properly (`git branch --merged`, or compare the commit list), not by
reading the branch name. Work often lands by a different route than the branch
it started on: it was cherry-picked, re-done in another PR, or squash-merged
under a new commit. A squash-merge in particular leaves the original commits
unreachable, so confirm the *content* is present before calling it landed.

**Still alive** — committed to within the last 30 days. Leave it alone entirely.

**Stale with unique work** — older than 30 days, and holds commits whose content
is not in the default branch. This is the bucket that matters.

## 3. Act

- **Already landed** → delete the remote branch. Say which ones in the report.
  This is the only deletion you may make on your own.
- **Still alive** → do nothing, don't report it.
- **Stale with unique work** → **do not delete, do not merge.** Read what's
  actually in it and write it up (next step).

If a stale branch would *revert* something currently live — it branched before a
change and still carries the old version of those lines — say so in capitals in
the write-up. One branch in the August 2026 sweep would have undone the whole
bank-bonus redesign if it had been merged without looking.

## 4. Report

Open ONE issue in `BarkernotBob/BarkernotBob.github.io` titled
`Branch sweep — <Month Year>`, and only if there is at least one stale branch
with unique work. For each one:

- repo and branch name, and how old it is
- **what it does**, in one or two plain sentences — not the commit messages,
  what the change would actually do for someone using the site
- whether merging it would revert anything
- your recommendation: **merge it** (say what it would take), or **delete it**
  (say what's lost), and which you'd pick

End the issue with a numbered list of the branches so Isaiah can answer
"1 merge, 2 delete, 3 delete" in a single comment.

Label it `hold` — it's a decision, not something the nightly routine should
try to build.

Then send one push notification: how many branches were deleted as already
landed, and how many need a decision. No repo names, no branch names.

If nothing was stale and nothing was deleted, file no issue and send no
notification. A quiet month is the expected outcome.
