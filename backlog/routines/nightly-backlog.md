# Nightly backlog — worker briefing

This is the prompt handed to each fresh worker session by the nightly Routine.
It has to stand alone: the worker starts with no memory of anything.

---

Run the nightly backlog pass. Nobody is awake — do not ask questions. Decide, do the work, and leave a written trail on the issues.

**Before anything else, confirm you can actually reach GitHub.** List the open issues in `BarkernotBob/BarkernotBob.github.io`. If you have no `mcp__github__*` tools, no `add_repo`, or the call is refused, stop immediately and send a notification saying exactly that — do not clone anything, do not improvise a workaround, and do not report the run as a quiet night. A run that cannot see the backlog is a broken run, not an empty one.

Then:

1. Make sure you have `BarkernotBob/BarkernotBob.github.io` available (`add_repo` it if this session doesn't already have it), on the `main` branch.
2. Read `.claude/commands/backlog-nightly.md` from that repo and follow it exactly. It is the authority for this run.
3. `backlog/repos.txt` in that repo is the list of projects in scope. Nothing outside it may be touched. **Do not attach every repo.** Run one search per owner listed in `repos.txt` — `is:open is:issue user:BarkernotBob` today, since every entry is currently his — to find which repos actually have open issues, then `add_repo` only those, one repo at a time, and retry a refusal once. Most nights that is one or two repos rather than the whole list. Any repo whose owner no search covered must be attached and listed directly. Then audit two repos the search called empty, so a scan that silently misses work gets caught rather than trusted. The command file's "Find the work before attaching anything" and "Audit two repos the search called empty" sections are the authority; they are not repeated here so the two can't drift apart.
4. `CLAUDE.md` in each repo you work in is the authority on how to build — mobile-first UI, no reflow on click, verify UI changes by rendering them, `/code-review` before calling anything complete.

## What counts as work

**Any OPEN issue in a repo in `repos.txt` is a planned item.** Labels only ever subtract:

- `blocked` or `hold` → skip entirely
- `in-progress`, untouched for over a day → resume
- `needs-grilling` → open a grilling chat instead of building
- no label at all → build it. This is the normal case.

There is no `planned` label and no `nightly-ok` label. Both were retired on 2026-08-09 and deleted from every repo. Never wait for a label before treating an open issue as work.

**Whether an unlabelled item is ready to build, or needs grilling first, is decided by "Is it ready to build, or does it need grilling?" in the command file.** Read it before picking anything up — it is the difference between building the wrong thing overnight and asking one question Isaiah can answer in a sentence. Short is not ambiguous, and big is not ambiguous; only unclear intent is.

**Never invent work.** The queue is open issues in `repos.txt`, and an empty night is a correct outcome. Do not file wishlist items or go looking for something to do.

If `.claude/commands/backlog-nightly.md` does not exist on `main`, the system hasn't been merged yet. Stop immediately, do nothing else, and say so.

If every repo in scope has no open issues except ones labelled `blocked` or `hold`, there is no work. Stop and say so — an empty night is a fine outcome, and you should not go looking for other things to do.

## Always report the counts

Before you stop, in every case including an empty night, report: how many repos you **covered** (accounted for out of `repos.txt`), how many you **opened** (actually attached and listed), how many you **audited** (opened purely to check the search), how many you were refused, how many open issues you found, how many you built, and how many you skipped and why.

Mind which channel each goes in. The **notification carries counts only** — never private repo names or issue titles. The **names of repos you were refused go on the coverage issue**, per the command file's step 4.

**Never report coverage as a single number.** Under search-first most repos are never opened on any given night — that is the design, and it is fine — but it means a lone "18/18 covered" would read as "I looked at eighteen repos" on a night nobody opened sixteen of them. `opened` and `audited` are what say how much was actually seen, so they travel with the fraction every time. A repo `add_repo` refused is a blind spot, not an empty one; say so in the same breath as any empty result.

A run that does nothing must say why it did nothing. This routine spent three weeks reporting success while doing no work at all; the counts are what makes that impossible to repeat.
