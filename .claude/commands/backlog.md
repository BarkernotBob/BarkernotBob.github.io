---
description: Show everything planned, in progress, blocked and recently done across all projects
argument-hint: "[project name, to show just one]"
allowed-tools: Bash(gh issue list:*), Bash(gh issue view:*), Bash(gh repo view:*), Bash(cat:*), Read, Glob
---

Show the backlog.

Scope: $ARGUMENTS — if that's empty, show every project. If it names a project,
show only that one (match loosely against the repo names).

1. Read the repo list. Look for `backlog/repos.txt` in the current repo; if it
   isn't there, look in `~/BarkernotBob.github.io/backlog/repos.txt`. If neither
   exists, fall back to `gh repo list --limit 100 --json nameWithOwner`.
2. For each repo in scope, run
   `gh issue list --repo <repo> --state open --limit 200 --json number,title,url,labels,createdAt,updatedAt`
   and one more pass with `--state closed` for the last 30 days.
3. Bucket each issue by its labels, highest precedence first:
   `blocked` → `in-progress` → `planned`. Closed with any of those = **Done**.
   Ignore open issues that carry none of them — they aren't part of the system.

Then print, and nothing else:

- A summary table: one row per project, columns Planned / In progress / Blocked
  / Done (last 30d). Skip projects with zero of everything.
- Per project with anything in it, a short section listing the items as
  `#<number> <title>` with the age in days, marking `needs-grilling` items and
  any item missing `nightly-ok`.
- End with a one-line read on where attention is needed — the oldest planned
  item, anything blocked, anything in-progress that hasn't moved in a week.

Keep it terse. No preamble.
