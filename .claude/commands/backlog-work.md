---
description: Pick up a planned item, build it, leave progress notes, close it when done
argument-hint: "<issue number or repo#number, or nothing to pick the oldest>"
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Skill
---

Work a backlog item through to done. Target: $ARGUMENTS — if empty, take the
oldest open item labelled `planned` in the current repo.

## Pick it up

1. `gh issue view <number> --repo <repo> --json number,title,body,labels,comments`
   and read the whole thing, comments included. Prior comments are the record of
   what's already been tried.
2. If it's labelled `needs-grilling`, stop and run `/backlog-grill <number>`
   instead. It isn't ready to build.
3. Move it: `gh issue edit <number> --repo <repo> --remove-label planned --add-label in-progress`.
4. Comment with the plan before writing code — the approach in a few sentences,
   the files you expect to touch, and anything in the issue you had to interpret.

## Build it

Normal rules apply — CLAUDE.md is the authority, not this file. In particular:

- Mobile UI is designed separately from desktop, not shrunk down.
- Clicking a control must never reflow the page around it.
- Never call a UI fix done until you've rendered it and looked at it.
- Commit at each working checkpoint, not once at the end.
- Run `/code-review medium` on the diff and fix confirmed findings before you
  call it complete.
- Add or extend a regression test that would have caught this, so it runs on
  every future deploy.

## Notes as you go

Comment on the issue at each real checkpoint — a decision made, a dead end hit,
a checkpoint verified. Not a running log of every file edit. If you get blocked,
say so in a comment, add the `blocked` label, remove `in-progress`, and stop.

## Close it

1. Confirm every "Done when..." line in the issue actually holds. Check them,
   don't assume.
2. Open a PR that says `Closes #<number>` in the body.
3. Wait for CI. Merge when it's green.
4. Post a final comment: what changed, and a **Manual test (for Isaiah)** —
   numbered plain-English steps a non-developer can follow to see it working.
5. `gh issue close <number> --repo <repo> --reason completed` and remove the
   `in-progress` label.

If you couldn't finish, do not close it. Leave it `in-progress` or `blocked`
with a comment saying exactly where you stopped and what the next step is.
