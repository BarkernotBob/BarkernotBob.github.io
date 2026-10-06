---
description: Do the next thing on one project — build the top ready item, or grill the next rough one
argument-hint: "[project name — nothing means the repo this chat is in]"
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Skill
---

Take one project's next step. Project: $ARGUMENTS — if empty, the repo this
chat is in. Otherwise match the name loosely against `backlog/repos.txt` (here,
or `~/BarkernotBob.github.io/backlog/repos.txt`). If it matches more than one,
list them and stop.

One item per chat. When this one is done, start a new chat and run it again.

## Reading and writing GitHub

There are two ways to reach GitHub and only one works in any given session:

- On Isaiah's Mac, the `gh` CLI is installed — use it.
- In a cloud session there is no `gh` — use the GitHub MCP tools (`mcp__github__*`).

Run `command -v gh` once at the start, pick the one that's there, and stick to
it. Every `gh ...` example below has a direct MCP equivalent.

## Pick the next thing

List the project's open issues, titles and labels only:
`gh issue list --repo <repo> --state open --limit 100 --json number,title,labels,createdAt,updatedAt`.

Also find the nightly run's open PRs in this repo:
`gh pr list --repo <repo> --state open --search '"Built by the nightly backlog run" in:body'`.
An issue one of those closes is already built and waiting on CI — skip it, or
it gets built twice.

1. **Something ready to build?** Any issue without `blocked`, `hold`,
   `needs-grilling` or a fresh `in-progress` (one updated in the last 12 hours is
   someone else's live work). Rank them the way step 2 of
   `/backlog-nightly` does — stalled `in-progress` first, then `urgent`, then
   broken, then oldest. Run `/backlog-work <number>` on the top one.
2. **Otherwise, something to grill?** Take the oldest `needs-grilling` issue and
   run `/backlog-grill <number>` on it. The nightly run usually left its
   questions as a comment there; start from those rather than asking them again.
3. **Otherwise, something blocked?** Name each `blocked` issue in one line with
   what its last comment says it needs from Isaiah, and stop.
4. **Otherwise:** say the project has nothing open that needs anything, and stop.

Don't read issue bodies until you've picked the one you're doing.
