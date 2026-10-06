# backlog/ — the machinery

User-facing instructions live in [`../BACKLOG_GUIDE.md`](../BACKLOG_GUIDE.md).
This file is the map for whoever maintains the system.

## The model

One GitHub issue = one planned change. Issues live in the repo they affect —
there is no central backlog repo. "Project" means "repo".

**Any open issue is a planned item.** Labels only ever subtract from that, never
add to it. This is load-bearing: the first version required a `planned` label,
the GitHub phone app can't apply labels through issue forms, and items filed
from a phone silently vanished. Nothing in this system may reintroduce a tag
that has to be remembered at filing time. `urgent` is the one exception that
_adds_ — but only order, never visibility: an item without it is still worked.

| File                              | Role                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repos.txt`                       | The only list that matters. Nothing outside it is ever installed to, read from, or worked on by the nightly routine.                                                                                          |
| `labels.json`                     | The status labels, plus `urgent`. Single source of truth — the forms and the tests both check against it.                                                                                                     |
| `templates/*.yml`                 | The two issue forms, installed into every repo except this one.                                                                                                                                               |
| `../.github/ISSUE_TEMPLATE/*.yml` | This repo's copies, which add a "which part of the site" dropdown because this repo holds six tools. Deliberately not generated from `templates/` — `install.sh` skips this repo so they don't get clobbered. |
| `install.sh`                      | Pushes labels + forms to every repo in `repos.txt` via the GitHub API, and copies the Claude commands to `~/.claude/commands`. Idempotent; no-ops when the remote file already matches.                       |
| `backlog.py`                      | Reads every repo's issues and renders `../BACKLOG.md`. Gitignored output — this repo is public and most of the issues are not.                                                                                |
| `backlog.test.mts`                | Regression suite for the labels, forms and `BACKLOG.md` bucketing.                                                                                                                                            |
| `capture-page.test.mts`           | Regression suite for `../quartz/static/Backlog.html` — no secrets, no repo names, correct URL encoding.                                                                                                       |
| `../quartz/static/Backlog.html`   | The manual capture page. Unlinked and `noindex`; reachable only by bookmark.                                                                                                                                  |
| `../.claude/commands/backlog*.md` | `/backlog-add`, `/backlog`, `/backlog-next`, `/backlog-work`, `/backlog-grill`, `/backlog-nightly`.                                                                                                           |

## Status precedence

An issue can end up with more than one status label. Everything that reads the
board resolves it the same way, highest first:

```
blocked  >  hold  >  in-progress  >  (nothing) = planned
```

`needs-grilling` is an orthogonal flag, not a status: the item still shows as
planned, but the nightly routine writes its questions on the issue instead of
building it, and Isaiah grills it in a chat of its own (`/backlog-next` or
`/backlog-grill`).

## Things that will bite you

- **Never make visibility depend on a label.** GitHub silently drops labels it
  doesn't know, and the phone app skips issue forms entirely, so anything
  required at filing time is a way for items to disappear. A test asserts the
  forms apply nothing but `needs-grilling` / `hold`.
- **`quartz/static/Backlog.html` is on a public site.** It holds no token and no
  repo names — the project list is pasted in once and lives in localStorage, and
  filing works by opening GitHub's own new-issue URL pre-filled. Tests assert
  both. Don't "improve" it by baking the repo list in.
- **`BACKLOG.md` must stay gitignored.** This repo is public; the issue titles it
  aggregates come from private repos.
- **The nightly routine merges its own work.** That was an explicit decision, not
  an oversight. The guardrails that make it survivable are in
  `../.claude/commands/backlog-nightly.md`: at most three workers at once and
  one per repo, nothing new after two hours, never on red CI, and a hard
  exclusion list covering workflows, secrets and branch settings.
- **`install.sh` is POSIX `sh`, on purpose**, so it can be parsed and exercised in
  CI. The `.command` wrappers stay zsh to match the other launchers.
- **There is no `gh` in a cloud session.** Local Claude Code has the CLI; the
  overnight Routine runs in Anthropic's cloud environment, which has the GitHub
  MCP tools instead. Every command file says so up front and every `gh` example
  in them has an MCP equivalent. Anything new that shells out to `gh` has to
  carry the same fallback or it will only ever work on the Mac.
- **A cloud run can only read the repos attached to it.** See "Repo coverage"
  below.

## Repo coverage

**Interactive sessions** start holding one repo and call `add_repo` for the
rest. The session's auto-mode permission classifier refuses some of those calls
at random (more often when several go out together), so a chat should attach
one repo at a time and retry a refusal once. A session Claude launches can't
start with every repo attached either: `create_session` takes `source_url` —
singular, one string.

**The scheduled Routine sidesteps this.** A Routine made from the web page
(claude.ai/code/routines → New routine) can have many repos attached, and every
run starts with all of them readable. It has no `add_repo` at all — and needs
none. **Adding a repo to `repos.txt` means adding it to the Routines too**, or
it can't be read.

### One search, one audit

Since 2026-10-06 the nightly reads no repo one by one. One search finds every
open, buildable issue across the owner:

```
search_issues: is:open is:issue user:BarkernotBob -label:blocked -label:hold -label:needs-grilling
```

Most nights that returns nothing and the run ends there. The earlier design
listed every repo every night, and read issue bodies and code for items it
never got to; that is what made single nights cost most of a week's usage.

**One thing is unproven:** that the search sees every repo the Routine can read.
So every run **audits one repo**, rotating over `repos.txt` by day of year, and
compares a direct listing with the search. A mismatch means the search is
unreliable: the run says so in the notification, falls back to listing every
repo, and records it on the issue below.

A repo the tools refuse is **unreachable** — it isn't attached to the Routine.
The notification gets an "Add access" line naming it and linking the Routine
page, and the name goes on a reused issue titled
`Nightly pass could not reach every repo`, labelled `hold` (it is a platform
limitation, not buildable work, so a later pass must not try to fix it).

**Never report a blind spot as a quiet night.** "No open issues" and "I never
looked" mean different things; an issue filed from a phone into a repo the run
can't read is invisible, the same silent disappearance the retired `planned`
label caused.

## What the nightly run may build

Two rules keep an unattended agent from either building the wrong thing or
inventing something to do. Both live in full in the command file.

**Ready vs needs-grilling.** Isaiah aligns with an agent in chat on exactly what
an issue requires, then lets it build, then reviews. The nightly has no such
conversation, so a grilling chat _is_ that conversation deferred. An item is
ready when it names an observable behaviour, you can locate it in the code, you
could write its "Done when…" lines and he would recognise them, and two
developers reading it would build the same thing. It needs grilling when it
names a feeling, has two readings, or needs a product decision.

Crucially, **thin is not ambiguous and big is not ambiguous.** A one-line issue
naming a real symptom is buildable; a large well-specified job is buildable.
Only unclear _intent_ sends something to grilling — otherwise the safety valve
becomes a way of never shipping.

**Never invent work.** The queue is open issues in `repos.txt`. An empty night
is a correct and complete outcome, and the run must stop rather than look for
something to do. It may not file wishlist items, refactors or "while I was in
here" ideas — those go as a comment on the issue being worked. The only things
it may file are a defect it actually reproduced, and the coverage issue above.

## Adding a repo

Add the line to `repos.txt`, run `../Install Backlog System.command`. That's the
whole procedure — the repo list drives everything else.
