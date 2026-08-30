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

### The fix: stop attaching repos that have no work

The refusals only matter because the run was attaching all 18 repos every night
to ask each one whether it had anything to do. It almost never did — on 30 Aug,
17 of 18 were empty. Eighteen `add_repo` calls to find work in one repo is
eighteen chances for the classifier to refuse.

One search answers the same question without attaching anything:

```
search_issues: is:open is:issue user:BarkernotBob
```

So the run now **searches first and attaches only the repos that came back with
open issues** — typically one or two. `list_issues` on those is still the
authority it builds from; the search is discovery, the listing is truth.

**One thing about that search is unproven.** It has never been observed
returning an issue from a repo the session has _not_ attached, because no such
issue has existed to test it with. On 30 Aug all 18 repos were attached and the
search agreed exactly with per-repo enumeration — but that is agreement under
the easy condition. If the search turns out to be scoped to attached repos, a
repo with real work would silently never be seen.

So every run **audits two repos the search called empty**, rotating by day of
month so the list is covered over a few weeks. If either turns out to have an
open issue, the search is unreliable: the run says so, falls back to attaching
everything, and records it. Two extra `add_repo` calls a night is the price of
the fast path being unable to fail silently.

### What the run must do about it

`.claude/commands/backlog-nightly.md` is the authority; in short:

|              |                                                                                         |
| ------------ | --------------------------------------------------------------------------------------- |
| Ledger       | Every repo lands in exactly one of **read** / **empty** / **assumed** / **unreachable** |
| Notification | Carries coverage as a fraction (`18/18 repos covered`), every run, names never          |
| Names        | Go on a reused issue titled `Nightly pass could not reach every repo`, labelled `hold`  |
| The rule     | **`empty`, `assumed` and `unreachable` must never be collapsed into one number**        |

That last line is the whole point. "No open issues", "probably no open issues"
and "I never looked" are indistinguishable in a summary that only counts issues
found, and they mean different things — an issue filed from a phone into a repo
the run never examined is invisible, which is the same class of silent
disappearance the retired `planned` label caused. The coverage issue is labelled
`hold` on purpose: it is a platform limitation rather than buildable work, so a
later pass must not pick it up and try to fix a classifier it doesn't control.

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
