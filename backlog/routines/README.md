# backlog/routines/ — the scheduled runs

User-facing setup instructions: [`SETUP.md`](SETUP.md). Read that first if you
just want the thing working.

This file explains why the design looks the way it does.

## Two failures this is built around

**1. A Routine Claude creates can't reach GitHub.** The first nightly Routine
(2026-08-08) and the dispatcher that replaced it (2026-08-27) were both created
by Claude with `create_trigger`. A Routine made that way runs with a stripped
tool set: no `mcp__github__*` and no `add_repo`. The dispatcher was also bound
to one long-lived chat, and attaching a repo to the Routine afterwards did not
give that chat any new tools — so every night it resumed, could list nothing,
and stopped. The run still showed as succeeded.

**2. A working Routine has no `add_repo` — and that's fine.** A Routine made
from the web page starts a fresh chat each run with GitHub tools for exactly the
repos attached to it. It never has `add_repo`. The briefings used to list a
missing `add_repo` as a reason to stop, so the first run that could actually
read GitHub (2026-09-22) stopped itself. A test now guards against that.

**3. The Routine can't open new chats.** `create_session` comes from the
Claude Code Remote connector. The web page can't attach it, and `create_trigger`
from a chat stores no connectors (tried 2026-09-23). So grill and blocked
questions are asked at the end of the nightly run, in its own chat — see step 3
of the command file.

## The design

Each Routine is made **from the web page** with **every repo in `repos.txt`
attached**. Each run is a fresh chat — no dispatcher, no shared transcript
growing night after night.

The Routine's own instructions are short: open the briefing in this folder on
`main` and follow it. So changing what a run does is a normal PR here; only the
repo list and schedule live in the Routine itself.

## The files

| File                      | Role                                             |
| ------------------------- | ------------------------------------------------ |
| `SETUP.md`                | How to rebuild either Routine from the web page. |
| `nightly-backlog.md`      | Briefing for each nightly run.                   |
| `monthly-branch-sweep.md` | Briefing for each monthly run.                   |

## If a run goes quiet again

Every briefing here ends with a rule: **report the counts on every run, including
an empty one.** A run that did nothing must say why it did nothing. That is the
only thing standing between "the backlog was empty" and "the routine has been
broken since June".
