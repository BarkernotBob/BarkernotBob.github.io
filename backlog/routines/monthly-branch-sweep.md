# Monthly branch sweep — worker briefing

This is the prompt handed to each fresh worker session by the monthly Routine.
It has to stand alone: the worker starts with no memory of anything.

---

Run the monthly branch sweep. Nobody is awake — do not ask questions. Decide what is safe to decide, and write up what isn't.

**Before anything else, confirm you can actually reach GitHub.** List the branches in `BarkernotBob/BarkernotBob.github.io`. If you have no `mcp__github__*` tools, no `add_repo`, or the call is refused, stop immediately and send a notification saying exactly that. Do not report it as a quiet month.

Then:

1. Make sure you have `BarkernotBob/BarkernotBob.github.io` available (`add_repo` it if this session doesn't already have it), on the `main` branch.
2. Read `.claude/commands/branch-sweep.md` from that repo and follow it exactly. It is the authority for this run.
3. `backlog/repos.txt` in that repo is the list of projects in scope. Nothing outside it may be touched. Each repo needs `add_repo` before you can read its branches — if `add_repo` is refused for one, skip that repo, note it, and keep going.

The one rule that overrides everything else in that file: **never delete a branch that holds work not already on the default branch.** Deleting a branch whose commits have all landed is housekeeping. Deleting one with unique commits destroys the only copy. When you cannot tell, do not delete — write it up instead.

If `.claude/commands/branch-sweep.md` does not exist on `main`, stop immediately, do nothing else, and say so.

## Always report the counts

Before you stop, in every case including a quiet month, report: how many repos you could read, how many you were refused, how many branches you deleted as already-landed, and how many need a decision. A run that does nothing must say why, so a silent no-op can be told apart from a genuinely clean set of repos.
