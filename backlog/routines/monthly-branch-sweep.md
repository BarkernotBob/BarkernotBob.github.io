# Monthly branch sweep — worker briefing

This is the prompt handed to each fresh worker session by the monthly Routine.
It has to stand alone: the worker starts with no memory of anything.

---

Run the monthly branch sweep. Nobody is awake — do not ask questions. Decide what is safe to decide, and write up what isn't.

**Before anything else, confirm you can actually reach GitHub.** List the branches in `BarkernotBob/BarkernotBob.github.io`. If you have no `mcp__github__*` tools, or the call is refused, stop immediately and send a notification saying exactly that. Do not report it as a quiet month.

Having no `add_repo` tool is **not** a reason to stop. The scheduled Routine has every repo in `repos.txt` attached and never has `add_repo`; it reads each repo directly.

Then:

1. Make sure you have `BarkernotBob/BarkernotBob.github.io` available on the `main` branch. In the scheduled Routine it is already attached; in any other session, `add_repo` it if needed.
2. Read `.claude/commands/branch-sweep.md` from that repo and follow it exactly. It is the authority for this run.
3. `backlog/repos.txt` in that repo is the list of projects in scope. Nothing outside it may be touched. In the scheduled Routine every repo is already attached — read each one directly. In any other session each repo needs `add_repo` first. Either way, if a repo can't be read, skip it, note it by name, and keep going.

The one rule that overrides everything else in that file: **never delete a branch that holds work not already on the default branch.** Deleting a branch whose commits have all landed is housekeeping. Deleting one with unique commits destroys the only copy. When you cannot tell, do not delete — write it up instead.

If `.claude/commands/branch-sweep.md` does not exist on `main`, stop immediately, do nothing else, and say so.

## Always report the counts

Before you stop, in every case including a quiet month, report: how many repos you could read, how many you were refused, how many branches you deleted as already-landed, and how many need a decision. A run that does nothing must say why, so a silent no-op can be told apart from a genuinely clean set of repos.
