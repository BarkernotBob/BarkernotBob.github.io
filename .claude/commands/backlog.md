---
description: Show everything planned, in progress, blocked and recently done across all projects
argument-hint: "[project name, to show just one]"
allowed-tools: Bash(gh issue list:*), Bash(gh issue view:*), Bash(gh repo view:*), Bash(gh repo list:*), Bash(command -v:*), Read, Glob, mcp__github__list_issues, mcp__github__issue_read, mcp__github__search_issues, mcp__github__search_repositories
---

Show the backlog.

## Reading and writing GitHub

There are two ways to reach GitHub and only one works in any given session:

- On Isaiah's Mac, the `gh` CLI is installed — use it.
- In a cloud session there is no `gh` — use the GitHub MCP tools (`mcp__github__*`).

Run `command -v gh` once at the start, pick the one that's there, and stick to
it. Every `gh ...` example below has a direct MCP equivalent.

Scope: $ARGUMENTS — if that's empty, show every project. If it names a project,
show only that one (match loosely against the repo names).

1. Read the repo list. Look for `backlog/repos.txt` in the current repo; if it
   isn't there, look in `~/BarkernotBob.github.io/backlog/repos.txt`. If neither
   exists, fall back to `gh repo list --limit 100 --json nameWithOwner`.
2. For each repo in scope, run
   `gh issue list --repo <repo> --state open --limit 200 --json number,title,url,labels,createdAt,updatedAt,closedAt,stateReason`
   and one more pass with `--state closed` for the last 30 days. Skip closed
   issues whose `stateReason` is `NOT_PLANNED` — those were abandoned, not
   shipped, and counting them as Done overstates what got built.
3. Bucket each issue by its labels, highest precedence first:
   `blocked` → `hold` → `in-progress`. **An open issue with no label at all is
   Planned** — that is the normal case, not an oversight. Closed = **Done**.

Then print, and nothing else:

- A summary table: one row per project, columns Planned / In progress / Blocked
  / On hold / Done (last 30d). Skip projects with zero of everything. Don't drop
  the On hold column — an item parked there is invisible if nothing counts it.
- Per project with anything in it, a short section listing the items as
  `#<number> <title>` with the age in days, marking `needs-grilling` items.
- End with a one-line read on where attention is needed — the oldest planned
  item, anything blocked, anything in-progress that hasn't moved in a week.

Keep it terse. No preamble.
