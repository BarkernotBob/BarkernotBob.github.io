# Setting up the Routines

Only needed if a Routine is lost or has to be rebuilt. Both are live today — IDs
are in `HANDOFF.md`.

**Make them yourself on the web page. Don't ask Claude to create them.** A
Routine Claude creates gets no GitHub tools, and there is no way to add them
afterwards. That is what kept the nightly broken from August to September 2026.

---

## Nightly backlog

Open **https://claude.ai/code/routines** → **New routine**.

1. **Name:** `Nightly backlog`
2. **Instructions:** paste the block below.
3. **Repositories:** attach every repo in `backlog/repos.txt` — the first one in
   the box under the instructions, then **+** for each of the rest.
4. **Trigger:** Schedule → Daily → 2:00 AM.
5. **Connectors:** remove them all. The run only needs GitHub, which comes from
   the repos.
6. **Notifications:** on, with **Push notification** ticked.
7. **Create**, then press **Run now** once and check the run reports counts.

```
Run tonight's backlog pass.

Your briefing is `backlog/routines/nightly-backlog.md` in BarkernotBob/BarkernotBob.github.io. Make sure you are on an up-to-date `main`, open that file, and carry out everything below its first `---` divider line. It is the authority for this run.

How this session reaches GitHub: every repo in `backlog/repos.txt` is attached to this routine, so the GitHub MCP tools can already read and write all of them. There is no `add_repo` tool in a routine session and you do not need one — wherever the briefing says to attach a repo, just use it. A repo in `repos.txt` that the tools refuse is `unreachable`: record it on the coverage issue and keep going. Only stop the whole run if you cannot read `BarkernotBob/BarkernotBob.github.io` itself.

The GitHub MCP tool schemas are deferred — load them with ToolSearch (e.g. `select:mcp__github__list_issues,mcp__github__search_issues,mcp__github__get_file_contents`) before the first call, or the call fails with InputValidationError. That error is not the same as having no GitHub access.

If, after loading, you have no `mcp__github__*` tools, or the briefing file is missing, stop and send a push notification that starts "BROKEN: nightly backlog did not run" and names what was missing. Never report a run that could not see GitHub as a quiet night.
```

## Monthly branch sweep

Same steps, except: name `Monthly branch sweep`, trigger Schedule → Custom →
`0 7 1 * *` (the 1st at 3:00 AM Eastern — the box is in UTC), and these
instructions:

```
Run this month's branch sweep.

Your briefing is `backlog/routines/monthly-branch-sweep.md` in BarkernotBob/BarkernotBob.github.io. Make sure you are on an up-to-date `main`, open that file, and carry out everything below its first `---` divider line. It is the authority for this run.

How this session reaches GitHub: every repo in `backlog/repos.txt` is attached to this routine, so the GitHub MCP tools can already read and write all of them. There is no `add_repo` tool in a routine session and you do not need one — wherever the briefing says to attach a repo, just use it. A repo in `repos.txt` that the tools refuse: skip it, note it by name, and keep going. Only stop the whole run if you cannot read `BarkernotBob/BarkernotBob.github.io` itself.

The GitHub MCP tool schemas are deferred — load them with ToolSearch (e.g. `select:mcp__github__list_branches,mcp__github__get_file_contents,mcp__github__list_commits`) before the first call, or the call fails with InputValidationError. That error is not the same as having no GitHub access.

If, after loading, you have no `mcp__github__*` tools, or the briefing file is missing, stop and send a push notification that starts "BROKEN: monthly branch sweep did not run" and names what was missing. Never report a run that could not see GitHub as a quiet month.
```

---

## When you add a repo to `repos.txt`

Open each Routine → edit → **+** under the instructions → pick the repo → save.
A repo in the list but not attached shows up as **unreachable** every night.

## How to tell it is working

The morning after a run you get a push notification with counts in it —
`18/18 covered · 18 opened · 0 audited`. **Counts are the signal.** No counts,
or a message starting "BROKEN", means it isn't working — open the run from the
Routine page to see why.
