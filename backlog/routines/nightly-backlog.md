# Nightly backlog — worker briefing

This is the prompt handed to each fresh worker session by the nightly Routine.
It has to stand alone: the worker starts with no memory of anything.

---

Run the nightly backlog pass. Nobody is awake — do not ask questions. Decide, do the work, and leave a written trail on the issues.

**Before anything else, confirm you can actually reach GitHub.** List the open issues in `BarkernotBob/BarkernotBob.github.io`. If you have no `mcp__github__*` tools, no `add_repo`, or the call is refused, stop immediately and send a notification saying exactly that — do not clone anything, do not improvise a workaround, and do not report the run as a quiet night. A run that cannot see the backlog is a broken run, not an empty one.

Then:

1. Make sure you have `BarkernotBob/BarkernotBob.github.io` available (`add_repo` it if this session doesn't already have it), on the `main` branch.
2. Read `.claude/commands/backlog-nightly.md` from that repo and follow it exactly. It is the authority for this run.
3. `backlog/repos.txt` in that repo is the list of projects in scope. Nothing outside it may be touched. Each repo needs `add_repo` before you can read its issues. Attach them **one at a time** — refusals cluster when several calls go out together — and **retry a refusal once** on its own, which often succeeds. Only after a second refusal is that repo out of reach: note it by name, and keep going. Do not end the run over a refusal. The command file's "Reaching every repo" section is the authority on this; it is not repeated here so the two can't drift apart.
4. `CLAUDE.md` in each repo you work in is the authority on how to build — mobile-first UI, no reflow on click, verify UI changes by rendering them, `/code-review` before calling anything complete.

## What counts as work

**Any OPEN issue in a repo in `repos.txt` is a planned item.** Labels only ever subtract:

- `blocked` or `hold` → skip entirely
- `in-progress`, untouched for over a day → resume
- `needs-grilling` → open a grilling chat instead of building
- no label at all → build it. This is the normal case.

There is no `planned` label and no `nightly-ok` label. Both were retired on 2026-08-09 and deleted from every repo. Never wait for a label before treating an open issue as work.

If `.claude/commands/backlog-nightly.md` does not exist on `main`, the system hasn't been merged yet. Stop immediately, do nothing else, and say so.

If every repo in scope has no open issues except ones labelled `blocked` or `hold`, there is no work. Stop and say so — an empty night is a fine outcome, and you should not go looking for other things to do.

## Always report the counts

Before you stop, in every case including an empty night, report: how many repos you reached, how many you were refused, how many open issues you found, how many you built, and how many you skipped and why.

Mind which channel each goes in. The **notification carries counts only** — never private repo names or issue titles. The **names of repos you were refused go on the coverage issue**, per the command file's step 4.

**A repo you could not attach is a blind spot, not an empty one.** Never let the two collapse into one number — "nothing to do" and "I never looked" read identically in a summary and mean opposite things. If coverage was incomplete, say so in the same breath as the empty result.

A run that does nothing must say why it did nothing. This routine spent three weeks reporting success while doing no work at all; the counts are what makes that impossible to repeat.
