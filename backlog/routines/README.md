# backlog/routines/ — the scheduled runs

User-facing setup instructions: [`SETUP.md`](SETUP.md). Read that first if you
just want the thing working.

This file explains why the design looks the way it does.

## The failure this is built around

A Routine freezes its tool grants at the moment it is created. The first nightly
backlog Routine was created on 2026-08-08 from a session that held no MCP tools,
so every session it fired had no `gh` CLI, no `mcp__github__*` tools and no
`add_repo`. It could clone this repo through the git proxy and read the
protocol — and then it could not list a single issue in any repo, including this
one.

It reported that correctly and sent a notification. But the run status was
**SUCCEEDED**, because the agent stopped cleanly. From the outside, a Routine
that had never once done any work looked healthy for three weeks.

Neither `update_trigger` (no such parameter) nor `create_trigger` (writes the
same default list regardless of who calls it) can repair a Routine's tool list
after the fact. It has to be created differently.

## The design

**One long-lived dispatcher session** — created the normal way, from the web app,
with this repo attached, so it holds the full tool set. Both Routines are bound
to it, so each firing resumes *that* session and inherits *its* tools.

**The dispatcher does no work.** On each firing it spawns a fresh worker session
with `create_session`, hands it a briefing, and stops. That is the whole job.

Why not let the dispatcher do the work directly? Because a bound Routine resumes
the same conversation every time. Thirty nights of backlog runs in one transcript
is thirty nights of context re-read on night thirty-one — the exact waste the
backlog system exists to avoid. The dispatcher's context grows by one tool call
per night; every worker starts clean.

```
Routine fires  →  dispatcher session (holds the tools, stays tiny)
                      │
                      └─ create_session  →  worker (clean context, full tools)
                                               └─ does the actual run
```

## The files

| File | Role |
| --- | --- |
| `SETUP.md` | The prompt to paste into a new chat. It deletes the broken Routines and creates the working ones. |
| `nightly-backlog.md` | Briefing handed to each nightly worker. |
| `monthly-branch-sweep.md` | Briefing handed to each monthly worker. |

The briefings are versioned here rather than living only inside the Routines, so
they can be reviewed in a PR and so a Routine can be rebuilt from the repo
without anyone having to remember what it said.

## If a run goes quiet again

Every briefing here ends with a rule: **report the counts on every run, including
an empty one.** A run that did nothing must say why it did nothing. That is the
only thing standing between "the backlog was empty" and "the routine has been
broken since June".
