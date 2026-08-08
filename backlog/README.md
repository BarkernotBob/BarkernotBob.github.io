# backlog/ — the machinery

User-facing instructions live in [`../BACKLOG_GUIDE.md`](../BACKLOG_GUIDE.md).
This file is the map for whoever maintains the system.

## The model

One GitHub issue = one planned change. Issues live in the repo they affect —
there is no central backlog repo. "Project" means "repo". Status is carried by
labels; **done** is not a label, done is a closed issue.

| File                              | Role                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repos.txt`                       | The only list that matters. Nothing outside it is ever installed to, read from, or worked on by the nightly routine.                                                                                          |
| `labels.json`                     | The five status labels. Single source of truth — the forms and the tests both check against it.                                                                                                               |
| `templates/*.yml`                 | The two issue forms, installed into every repo except this one.                                                                                                                                               |
| `../.github/ISSUE_TEMPLATE/*.yml` | This repo's copies, which add a "which part of the site" dropdown because this repo holds six tools. Deliberately not generated from `templates/` — `install.sh` skips this repo so they don't get clobbered. |
| `install.sh`                      | Pushes labels + forms to every repo in `repos.txt` via the GitHub API, and copies the Claude commands to `~/.claude/commands`. Idempotent; no-ops when the remote file already matches.                       |
| `backlog.py`                      | Reads every repo's issues and renders `../BACKLOG.md`. Gitignored output — this repo is public and most of the issues are not.                                                                                |
| `backlog.test.mts`                | Regression suite. Runs in `.github/workflows/backlog-checks.yml`.                                                                                                                                             |
| `../.claude/commands/backlog*.md` | `/backlog`, `/backlog-work`, `/backlog-grill`, `/backlog-nightly`.                                                                                                                                            |

## Status precedence

An issue can end up with more than one status label. Everything that reads the
board resolves it the same way, highest first:

```
blocked  >  in-progress  >  planned
```

Open issues carrying none of the three are not part of the system and are
ignored everywhere. `nightly-ok` and `needs-grilling` are orthogonal flags, not
statuses — exactly one of them should be set, and the forms guarantee that at
filing time.

## Things that will bite you

- **The forms' `labels:` must exist in the target repo before an issue is filed
  through them.** GitHub silently drops unknown labels, and the item then never
  appears on any view. `install.sh` creates labels before it uploads forms for
  this reason; the test asserts every form label is in `labels.json`.
- **`BACKLOG.md` must stay gitignored.** This repo is public; the issue titles it
  aggregates come from private repos.
- **The nightly routine merges its own work.** That was an explicit decision, not
  an oversight. The guardrails that make it survivable are in
  `../.claude/commands/backlog-nightly.md`: five merges a night, never on red CI,
  and a hard exclusion list covering workflows, secrets and branch settings.
- **`install.sh` is POSIX `sh`, on purpose**, so it can be parsed and exercised in
  CI. The `.command` wrappers stay zsh to match the other launchers.
- **There is no `gh` in a cloud session.** Local Claude Code has the CLI; the
  overnight Routine runs in Anthropic's cloud environment, which has the GitHub
  MCP tools instead. Every command file says so up front and every `gh` example
  in them has an MCP equivalent. Anything new that shells out to `gh` has to
  carry the same fallback or it will only ever work on the Mac.

## Adding a repo

Add the line to `repos.txt`, run `../Install Backlog System.command`. That's the
whole procedure — the repo list drives everything else.
