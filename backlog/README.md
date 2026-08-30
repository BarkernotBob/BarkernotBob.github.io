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
that has to be remembered at filing time.

| File                              | Role                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `repos.txt`                       | The only list that matters. Nothing outside it is ever installed to, read from, or worked on by the nightly routine.                                                                                          |
| `labels.json`                     | The four status labels. Single source of truth — the forms and the tests both check against it.                                                                                                               |
| `templates/*.yml`                 | The two issue forms, installed into every repo except this one.                                                                                                                                               |
| `../.github/ISSUE_TEMPLATE/*.yml` | This repo's copies, which add a "which part of the site" dropdown because this repo holds six tools. Deliberately not generated from `templates/` — `install.sh` skips this repo so they don't get clobbered. |
| `install.sh`                      | Pushes labels + forms to every repo in `repos.txt` via the GitHub API, and copies the Claude commands to `~/.claude/commands`. Idempotent; no-ops when the remote file already matches.                       |
| `backlog.py`                      | Reads every repo's issues and renders `../BACKLOG.md`. Gitignored output — this repo is public and most of the issues are not.                                                                                |
| `backlog.test.mts`                | Regression suite for the labels, forms and `BACKLOG.md` bucketing.                                                                                                                                            |
| `capture-page.test.mts`           | Regression suite for `../quartz/static/Backlog.html` — no secrets, no repo names, correct URL encoding.                                                                                                       |
| `../quartz/static/Backlog.html`   | The manual capture page. Unlinked and `noindex`; reachable only by bookmark.                                                                                                                                  |
| `../.claude/commands/backlog*.md` | `/backlog-add`, `/backlog`, `/backlog-work`, `/backlog-grill`, `/backlog-nightly`.                                                                                                                            |

## Status precedence

An issue can end up with more than one status label. Everything that reads the
board resolves it the same way, highest first:

```
blocked  >  hold  >  in-progress  >  (nothing) = planned
```

`needs-grilling` is an orthogonal flag, not a status: the item still shows as
planned, but the nightly routine opens a conversation about it instead of
building it.

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
  `../.claude/commands/backlog-nightly.md`: five merges a night, never on red CI,
  and a hard exclusion list covering workflows, secrets and branch settings.
- **`install.sh` is POSIX `sh`, on purpose**, so it can be parsed and exercised in
  CI. The `.command` wrappers stay zsh to match the other launchers.
- **There is no `gh` in a cloud session.** Local Claude Code has the CLI; the
  overnight Routine runs in Anthropic's cloud environment, which has the GitHub
  MCP tools instead. Every command file says so up front and every `gh` example
  in them has an MCP equivalent. Anything new that shells out to `gh` has to
  carry the same fallback or it will only ever work on the Mac.
- **A cloud run cannot be guaranteed to reach all 18 repos**, and this is worked
  around, not fixed. See "Repo coverage" below.

## Repo coverage

A cloud session starts holding exactly one repo and calls `add_repo` for each of
the others. Some of those calls come back refused — **by the session's own
auto-mode permission classifier, not by GitHub**:

> Permission for this action was denied by the Claude Code auto mode classifier.

The refusals are not about specific repositories. Across runs:

- A repo refused on one night is reachable the next. `logos-notes` was
  unreachable on 28 Aug and fine on 29 Aug.
- A repo refused inside a batch often succeeds when retried on its own. Two did
  on 29 Aug, more than one on 30 Aug.
- Refusals cluster when several `add_repo` calls are issued together. On 30 Aug
  a block of six produced two refusals; attaching one or two at a time went
  through nearly every time.

So it behaves like rate-limiting or a flaky classifier, and the mitigations are
**serialize the calls** and **retry each refusal once**. Neither makes coverage
certain.

**Launching the session with every repo pre-attached does not work.**
`create_session` takes `source_url` — singular, one string. There is no seeded
multi-repo source list to correct, so runtime `add_repo` is the only route in.
That was the most promising-sounding fix, and it is ruled out.

### What the run must do about it

Because coverage can't be guaranteed, the requirement is that a gap is never
silent. `.claude/commands/backlog-nightly.md` is the authority; in short:

|              |                                                                                        |
| ------------ | -------------------------------------------------------------------------------------- |
| Ledger       | Every repo lands in exactly one of **read** / **empty** / **unreachable**              |
| Notification | Carries coverage as a fraction (`15/18 repos read`), every run, names never            |
| Names        | Go on a reused issue titled `Nightly pass could not reach every repo`, labelled `hold` |
| The rule     | **`empty` and `unreachable` must never be collapsed into one number**                  |

That last line is the whole point. "No open issues" and "I never looked" are
indistinguishable in a summary that only counts issues found, and they mean
opposite things — an issue filed from a phone into a repo the run never attached
is invisible, which is the same class of silent disappearance the retired
`planned` label caused. The coverage issue is labelled `hold` on purpose: it is
a platform limitation rather than buildable work, so a later pass must not pick
it up and try to fix a classifier it doesn't control.

## Adding a repo

Add the line to `repos.txt`, run `../Install Backlog System.command`. That's the
whole procedure — the repo list drives everything else.
