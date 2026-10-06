---
description: The unattended nightly pass over the backlog — build and merge what's ready, flag what needs Isaiah
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Skill, Agent
---

You are running unattended, overnight. Isaiah is asleep. Nobody will answer a
question, so never ask one — not during the run and not at the end. Decide, do
the work, and leave a written trail on the issues.

**You are a thin coordinator.** You read issue titles and a few issue bodies,
launch workers, and record what they report. You never clone a repo, read code,
run tests, read a diff or a CI log. All of that happens inside a worker, so this
chat stays small however long the night runs.

## Limits (Isaiah, 2026-10-06)

The old design — every repo listed, batches of three, workers waiting on CI —
used most of a week's usage in single nights. These limits replace it:

- **At most three workers at once, and at most one per repo.** Two items from
  the same repo are never built at the same time.
- **Rolling, not batches.** When a worker finishes, its slot is refilled with
  the next item; nobody waits for the slowest of three.
- **No new item after 2 hours.** Note the start time (`date -u`) first thing.
  Once two hours have passed, launch nothing new; let running workers finish,
  then report and end.
- **No worker waits on CI.** A worker opens its PR, turns on auto-merge, and
  ends. The next night's run merges or fixes whatever it left (step 1).
- **No questions in this chat, ever.** An item that needs Isaiah gets its
  questions written on the issue and a label. He grills it in his own chat, one
  issue per chat, with `/backlog-next` or `/backlog-grill`.
- **Context cap.** No chat in this run should exceed about 200k tokens. The
  Routine's environment sets `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000` so
  compaction kicks in there (see `backlog/routines/SETUP.md`). Beyond that, keep
  everything you read small: titles before bodies, counts before detail.

## Reading and writing GitHub

There are two ways to reach GitHub and only one works in any given session:

- On Isaiah's Mac, the `gh` CLI is installed — use it.
- In a cloud session there is no `gh` — use the GitHub MCP tools (`mcp__github__*`).

Run `command -v gh` once at the start, pick the one that's there, and stick to
it. Every `gh ...` example below has a direct MCP equivalent.

### Prove you can reach GitHub before doing anything else

The MCP schemas are deferred: load them with `ToolSearch` before the first call
(`select:mcp__github__search_issues,mcp__github__search_pull_requests,mcp__github__get_file_contents,mcp__github__list_issues,mcp__github__issue_read,mcp__github__issue_write,mcp__github__add_issue_comment,mcp__github__pull_request_read,mcp__github__merge_pull_request`).
A call made without loading fails with `InputValidationError`, which reads like
"no GitHub access" but is not.

Then fetch `backlog/repos.txt` from `BarkernotBob/BarkernotBob.github.io`.
**If that read fails, stop the run**: send a push notification starting
`BROKEN: nightly backlog did not run`, naming the route you tried and quoting
the error. **Never continue past a failed probe** — a run that cannot read
GitHub cannot tell "no open issues" from "I could not look".

`repos.txt` is the scope. An issue or PR in a repo not listed there is ignored.

## 1. Finish last night's PRs first

Workers mark every PR they open with the line
`Built by the nightly backlog run.` in the body. One search finds the ones
still open:

```
search_pull_requests: is:open is:pr user:BarkernotBob "Built by the nightly backlog run" in:body
```

Usually this is empty. For each result (`pull_request_read`, status and
mergeability only — never the diff or logs):

- **The issue it closes is `blocked`, `hold` or `needs-grilling`** → leave it
  alone. A worker already handed it to Isaiah; fixing it again every night is
  the loop this rule exists to stop.
- **Checks green and mergeable** → squash-merge it and make sure the issue it
  closes is closed. Leave the branch: you have no tool to delete one, and the
  monthly branch sweep clears it.
- **Checks red, or a merge conflict** → it becomes a **Fix** item. Fix items go
  ahead of everything in step 2.
- **Checks still running** → leave it alone.

Note which issues these PRs close. Those issues are taken; never start them
again from step 2.

## 2. Find the work, cheaply

### One search, titles only

```
search_issues: is:open is:issue user:BarkernotBob -label:blocked -label:hold -label:needs-grilling
```

Sort oldest first, minimal output if offered — **no bodies**. Number, title,
labels, repo and dates are enough to rank. Drop anything outside `repos.txt`
and anything a step-1 PR already closes.

An `in-progress` issue updated in the last 12 hours is someone else's live work —
skip it. One untouched for longer is stalled — it is a **Resume** item. (12, not
24: a worker cut off at 5am was last touched about 21 hours before the next run,
and a 24-hour window would leave it for a second night.)

**If nothing is left, and step 1 found no Fix items, the night is empty.** Run
the audit below, send the notification (step 5), and end. Do not read anything
else. An empty night is a correct and complete outcome.

### Audit one repo, every night

The search has never been proven to see every repo the Routine can read. So each
run checks one: take `repos.txt` **sorted, as a fixed list**, and pick the repo
at position `day-of-year mod N`. `list_issues` on it (open, titles and labels
only), drop the ones labelled `blocked`, `hold` or `needs-grilling` (the search
leaves those out on purpose), and compare what remains with what the search
returned for that repo.

- They agree → note `audit ok` for the notification.
- The listing has an issue the search missed → **the search is unreliable.**
  Say so in the notification, comment it on the coverage issue (step 5), and
  for the rest of this run use `list_issues` (titles only) on every repo in
  `repos.txt` instead of the search.
- The tools refuse the repo → it is **unreachable**; see step 5.

### Rank by impact

Rank Fix + Resume + everything else into one list, highest impact first, from
titles and labels alone:

1. **Resume** — anything `in-progress` that stalled, plus step-1 Fix items.
   Finish what's started before starting anything new.
2. **Urgent** — labelled `urgent`. Isaiah (or Claude, with his yes) put it at
   the front on purpose; don't second-guess it.
3. **Broken** — something Isaiah already uses is wrong: a bug, wrong numbers,
   lost or corrupted data, a page that doesn't load.
4. **Unblocks** — other open issues depend on it.
5. **Daily use** — improves an app or page he uses often.
6. **Everything else.**

Ties: oldest first. Keep the ranked list in this chat, never on a public issue —
titles come from private repos.

### Never invent work

The queue is the open issues the search returned. That is the whole of it.

- **Do not file new work items.** Not wishlist ideas, not refactors, not "while
  I was in here I noticed". Say it as a comment on the issue being worked.
- **Do not widen an item** beyond what it asks for.
- **Do not go looking** for something to do when the queue is empty. An empty
  night is a correct and complete outcome.

Two narrow exceptions, both reports rather than work: a **defect a worker
actually reproduced** may be filed as one issue with its reproduction, and the
**coverage issue** in step 5.

## 3. Fill a slot

To fill a free slot, walk the ranked list from the top and take the first item
whose repo has no worker running. Then:

1. Read that one issue's body and comments (`issue_read`). Only this one —
   never read ahead for items you aren't launching now.
2. Apply the readiness test below. Not ready → post its questions on the issue,
   label it `needs-grilling`, and take the next item instead.
3. Ready → label it `in-progress` and launch its worker.

Start by filling up to three slots. **Launch each worker in the background**
(`run_in_background: true`) so you're told the moment one finishes. When one
does: record its result, and if the two hours aren't up, re-run the step-2
search (it's cheap, and it picks up anything filed or changed tonight), re-rank,
and fill that one slot. One item at a time, never a fresh batch.

### Is it ready to build, or does it need grilling?

Isaiah's normal way of working is to align with an agent in chat on exactly what
an issue requires, then let it build, then review the result. **The nightly run
has no such conversation available.** A grilling chat is that conversation,
deferred to when he is awake. So ask of each item: _could I have had that
alignment conversation with myself, and been confident of his answers?_

**Ready to build** — all four hold:

1. **Observable.** It names a behaviour, symptom or outcome you could point at
   on a screen. Not a feeling about the software.
2. **Located.** You can tell which app, page or flow it concerns.
3. **Checkable.** You can write the "Done when…" lines yourself, and he would
   recognise them as what he meant.
4. **One reading.** Two developers given only this text would build the same
   thing.

**Needs grilling** — any one of these:

1. It names a feeling or a verdict — "make it better", "clean this up" — with
   no symptom attached.
2. There are two plausible readings that lead to different builds.
3. It names a place but not a change, or a change but not a place.
4. It needs a product decision: several behaviours would satisfy the words, and
   picking one is picking for him.
5. You would have to invent acceptance criteria he never implied.
6. It is a preference — wording, ordering, layout — and no preference is stated.

**The test:** draft the "Done when…" lines. If you cannot write them without
guessing what he meant, or would not bet he would agree, it is not ready.

**These are NOT reasons to grill**, and treating them as such turns the safety
valve into a way of never building anything:

- **Thin.** A single dictated sentence naming a real symptom is buildable. Short
  is not ambiguous.
- **Big.** Size is not ambiguity. A large, clearly-specified job is ready.
- **Unfamiliar code.** That is research the worker does, not a question for him.
- **More than one way to implement it.** Choosing between implementations is
  the worker's job; choosing between intents is not.

When an item moves to `needs-grilling`, comment with **the specific questions
that blocked you**: every one that isn't blocked by another, as a numbered list
with your recommended answer on each. Hold back a question whose answer depends
on another; it comes up when he answers. Not a restatement of the issue. Each
one he can answer in a sentence. That comment is what his grilling chat starts
from.

### The worker prompt

Each prompt must stand alone:

- the repo, issue number and title, and the one-line reason it was ranked here
  (for a Fix item: the PR link and what's failing, by check name only);
- "Follow `.claude/commands/backlog-work.md` from
  BarkernotBob/BarkernotBob.github.io, with the overrides in step 4 of
  `.claude/commands/backlog-nightly.md`. The repo's own `CLAUDE.md` is the
  authority on how to build.";
- "GitHub MCP schemas are deferred — load them with `ToolSearch` first.";
- "Work on branch `nightly/<issue>` in a checkout of only this repo: the one
  already in the session if there is one, else a fresh clone under
  `/tmp/nightly/<repo>-<issue>`. Start from the latest default branch." For a
  Fix item instead: "Check out the PR's existing branch and push fixes to it.
  Never reset or force-push it." (For a conflict, merge the default branch in.);
- "Reply in at most 5 lines: `merged <PR link>`, `auto-merge <PR link>`,
  `pr-open <PR link>`, `blocked: <why>`, `needs-grilling`, or
  `stopped: <where>`."

## 4. Rules for every worker

`/backlog-work` applies, with these overrides because nobody is watching:

- **Never ask.** If the code shows the item is ambiguous after all, post the
  blocking questions on the issue (numbered, recommended answer on each), swap
  `in-progress` for `needs-grilling`, and reply `needs-grilling`.
- **Never touch, in any repo:** GitHub Actions workflow files, secrets,
  `.github/` permissions, branch protection, or anything under `.quartz/plugins/`.
  If an item needs one of those, label it `blocked` with a comment saying it
  needs a human, and stop.
- **Prove it locally, then hand off to CI.** Build, run the repo's own checks,
  run `/code-review medium` and fix confirmed findings, add the regression test.
  Open the PR with `Closes #<n>` and the line
  `Built by the nightly backlog run.` in the body. Then, without waiting:
  - **The repo has CI** (any workflow under `.github/workflows/` that runs on
    pull requests) → enable auto-merge, squash. Reply `auto-merge`. If
    auto-merge can't be turned on, leave the PR open and reply `pr-open`; the
    next run merges it once green.
  - **The repo has no CI** → squash-merge now, delete the branch, confirm the
    issue closed. Reply `merged`.
- **Never merge on red.** A worker never merges over a failing check; nor does
  step 1.
- **Delete the branch** whenever you merge. Branches auto-merge leaves behind
  are cleared by the monthly branch sweep.
- **Keep the issue's progress comment current**, so an item cut off mid-way is
  left `in-progress` with a note on exactly where it stopped and gets resumed.

## 5. Report

### The notification

One push notification. Counts and links only — **do not put private repo names
or issue titles in it**; the one exception is the Add access line below.

```
Merged 2 · 1 merging when CI passes · 1 stopped mid-way · audit ok
3 need you → https://github.com/search?q=user%3ABarkernotBob+is%3Aissue+is%3Aopen+label%3Aneeds-grilling%2Cblocked&type=issues
```

- Line 1: what tonight did, plus the audit result. On an empty night:
  `Nothing ready to build · audit ok`.
- Line 2: how many open issues are labelled `needs-grilling` or `blocked`
  across every repo (one `search_issues` count), with that link. Leave the line
  out when the count is zero.
- If the audit caught the search missing an issue, line 1 says so instead of
  `audit ok`. A scan caught missing work is a broken run, not a quiet one.

### Repos the run couldn't reach

A repo in `repos.txt` that the tools refused (in the audit or in a worker) is
**unreachable**: it isn't attached to the Routine. Only Isaiah can attach it.

1. Add a line to the notification, the one place a repo name goes in it:

   ```
   Add access: BarkernotBob/<repo> → https://claude.ai/code/routines/trig_01CAkWWvfRJwKKVyHFMoCGaV then Edit → + → pick the repo → Save
   ```

2. Comment tonight's date and the repo on the open issue in
   `BarkernotBob/BarkernotBob.github.io` titled
   **`Nightly pass could not reach every repo`**. If none is open, file it with
   that exact title and label it **`hold`** — it is a platform limitation, not
   buildable work, and `hold` keeps it out of the queue. Reuse it rather than
   filing one a night.

### Never report a blind spot as a quiet night

A repo you could not read has **unknown** contents, not empty ones. If the queue
came back empty, the notification says which case it was: the search found
nothing and the audit agreed, or something was unreachable or missed.

Then end the run. Everything else goes on the issues, next to the work.
