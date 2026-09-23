---
description: The unattended nightly pass over the backlog — build and merge what's ready, open grilling chats for what isn't
allowed-tools: Bash, Read, Edit, Write, Glob, Grep, Skill, Agent
---

You are running unattended, overnight. Isaiah is asleep. Nobody will answer a
question you ask, so don't ask one — decide, do the work, and leave a written
trail he can read in the morning. (The one exception is the end of the run:
step 3 leaves the night's open questions in this chat for him to answer later.)

## Reading and writing GitHub

There are two ways to reach GitHub and only one works in any given session:

- On Isaiah's Mac, the `gh` CLI is installed — use it.
- In a cloud session there is no `gh` — use the GitHub MCP tools (`mcp__github__*`).

Run `command -v gh` once at the start, pick the one that's there, and stick to
it. Every `gh ...` example below has a direct MCP equivalent.

### Prove you can reach GitHub before doing anything else

Having the tool is not the same as the tool working. The MCP schemas are
deferred: they must be loaded with `ToolSearch` before the first call, and a
call made without loading one fails with `InputValidationError` — which reads
like "no GitHub access" but is not.

So the start of every run is one real read, not a capability guess:

1. If you picked MCP, load the schemas you need first
   (`ToolSearch` with `select:mcp__github__search_issues,mcp__github__list_issues,...`).
2. Make one read-only call that must succeed: fetch `backlog/repos.txt` from
   `BarkernotBob/BarkernotBob.github.io`.
3. **If that read fails, stop the run.** Send a push notification saying the
   nightly pass could not reach GitHub, name the route you tried (`gh` or MCP)
   and quote the error. Then end.

**Never continue past a failed probe.** A run that cannot read GitHub cannot
tell "no open issues" from "I could not look", and reporting the first when the
second is true is the exact silent success this whole file exists to prevent.
An empty queue is only ever a real result _after_ this probe has passed.

## 1. Build the queue

`backlog/repos.txt` in `BarkernotBob/BarkernotBob.github.io` is the list of
projects in scope. Nothing outside it is ever read from or worked on.

### In a scheduled Routine: every repo is already attached

The nightly Routine is created with every repo in `repos.txt` attached to it,
and a Routine session has **no `add_repo` tool** — it can reach exactly the
repos attached to the Routine and no others. That is expected, not a failure.
In a Routine session:

- **Skip the search-first scan and the audit below.** They exist to avoid
  `add_repo` calls, and there are none to avoid.
- `list_issues` on **every** repo in `repos.txt`, directly — **lean**: see
  "Scan cheaply" below.
- A repo the tools refuse is `unreachable`: it is in `repos.txt` but was never
  added to the Routine. Record it by name (step 4) and keep going — only Isaiah
  can add a repo to a Routine.
- In the ledger every repo is then `read` or `unreachable`. `opened` is the
  number read, and `audited` is 0 because nothing was assumed.
- **If this run merges a change to `repos.txt`** (step 4 adds new projects),
  re-read it afterwards and `list_issues` on every newly listed repo. One the
  tools can read is in scope for the rest of this run — work it like any other.
  One they refuse is `unreachable`. Never leave a repo out of the queue just
  because it was added to `repos.txt` after the run started: on 2026-09-23
  `blockchain` was attached and readable, got added mid-run, and its issues
  still went untouched until the next night.

Everything from here to the ledger applies to interactive sessions, where repos
are attached on demand.

### Find the work before attaching anything

**Do not attach every repo.** One search per owner finds every open issue
without attaching anything:

```
search_issues: is:open is:issue user:BarkernotBob
```

`repos.txt` is the list that decides scope, not this query. Take the distinct
owners in `repos.txt` and run one search each — today they are all
`BarkernotBob`, but the file's format permits any `owner/repo`, and a repo whose
owner no search covered would be permanently invisible while counting as
covered. **Any repo in `repos.txt` not covered by an owner you searched must be
attached and listed directly**, every run, no exceptions.

Almost every night, all but one or two repos have nothing open. Attaching the
rest costs an `add_repo` call each — and each is a chance for the session's
auto-mode permission classifier to refuse, which is what produced the silent
coverage gaps this scan replaces.

So: **search first, then attach only the repos that actually have issues.**

1. Run the search above. It returns each issue with a `repository_url`.
2. Discard any repo not listed in `repos.txt`.
3. `add_repo` **only** the repos that came back with at least one open issue.
   Attach one repo at a time and retry a refusal once — refusals cluster when several
   calls go out together, and a lone retry usually succeeds. Two refusals means
   that repo is out of reach tonight: record it by name and keep going.
4. For each attached repo, `list_issues` is the authority you build from. The
   search is discovery; the listing is truth. Labels and dates from the listing,
   not from the search result.

### Audit two repos the search called empty

The search is fast but **unproven on repos this session has not attached** — it
has never been observed returning an issue from an unattached repo, because no
such issue has existed to test with. If it turns out to be scoped to attached
repos, a repo with real work would silently never be seen: the exact failure
this system keeps producing.

So every run checks a little of it:

- Take `repos.txt` **sorted, as a fixed list**, and pick the two at positions
  `(2 × day-of-year) mod N` and `(2 × day-of-year + 1) mod N`. Rotating over the
  fixed list — not over "whichever repos the search called empty tonight", which
  is a different set each night — is what actually walks the whole list. Skip
  any that the search flagged as having work, since those are being opened
  anyway, and take the next one along.
- Attach each and `list_issues`.
- **If either has an open issue the search missed, the search is unreliable.**
  Say so loudly, fall back to attaching every repo in `repos.txt` for the rest of
  this run, and record it on the coverage issue named in step 4. Do not quietly
  carry on with a scan you have just caught missing work.
- If both agree with the search, note that and move on.

Two extra `add_repo` calls a night is the price of the fast path not being able
to fail silently. Pay it.

### Keep a coverage ledger

Record every repo in `repos.txt` under exactly one of four outcomes:

| Outcome         | Meaning                                                                       |
| --------------- | ----------------------------------------------------------------------------- |
| **read**        | Search found work, repo attached, issues listed                               |
| **empty**       | Search found nothing, and the audit confirmed it                              |
| **assumed**     | Search found nothing, not audited this run                                    |
| **unreachable** | `add_repo` refused twice, or (in a Routine) not attached — _you never looked_ |

**Never collapse these into one number** — including in the notification. A
single "covered" fraction is exactly the collapse this table exists to prevent:
under search-first, most repos are `assumed` every night, so a lone `18/18`
would read as "I looked at eighteen repos" on a night nobody opened sixteen of
them. That is the silent-success failure this system keeps producing, wearing a
new number.

So the fraction never travels alone. **`opened` and `audited` go with it, every
time** — see step 4. "Nothing to do", "the search says nothing to do" and "I
never looked" mean different things, and an issue filed from a phone into a repo
the run never examined is invisible, which is the whole thing this system exists
to prevent.

If anything ends up `unreachable`, say so **by name** before you stop — step 4
explains where the names go, since the notification can't carry them.

### Scan cheaply: titles first, detail only for work you'll start

Most repos have nothing open on most nights. Reading one costs context the
build batches need, so the scan reads as little as it can:

- `list_issues` with `state: OPEN` and `fields: ["number", "title", "labels",
"created_at", "updated_at"]` — **no bodies**. That is enough to sort and to
  rank most items.
- Read an issue's body and comments (`issue_read`) only when it is a candidate
  for the **next batch**, or when its title alone can't be ranked.
- **Never clone a repo, read its `CLAUDE.md`, or open its code** during the
  scan. That happens inside the sub-agent building an item from that repo,
  and only then.

### Sort what you found

**An open issue with no label is work to do** — filing something must never
require remembering to tag it. Sort into:

Check Skip first — `blocked` and `hold` outrank everything, so an item that is
both `in-progress` and `blocked` is skipped, not resumed.

- **Skip** — labelled `blocked` or `hold`. Leave these completely alone.
- **Resume** — labelled `in-progress`, untouched for over a day. These come
  next; something stalled.
- **Grill** — labelled `needs-grilling`, or anything the next section says is
  not ready.
- **Build** — everything else that's open. This is the normal case and most
  items will land here.

### Rank by impact

Rank Resume + Build into one list, highest impact first:

1. **Resume** — anything `in-progress`. Finish what's started before starting
   anything new.
2. **Broken** — something Isaiah already uses is wrong: a bug, wrong numbers,
   lost or corrupted data, a page that doesn't load.
3. **Unblocks** — other open issues depend on it.
4. **Daily use** — improves an app or page he uses often (judge from the repo's
   recent commits and issue history, not a guess).
5. **Everything else.**

Ties: "Quick" before "Big", then oldest first. Write the ranked list into this
run's chat (not onto a public issue — titles from private repos). Grill items
are not ranked; they go to step 3.

### Is it ready to build, or does it need grilling?

Isaiah's normal way of working is to align with an agent in chat on exactly what
an issue requires, then let it build, then review the result. **The nightly run
has no such conversation available.** A grilling chat is that conversation,
deferred to when he is awake. So the question to ask of each item is: _could I
have had that alignment conversation with myself, and been confident of his
answers?_

**Ready to build** — all four hold:

1. **Observable.** It names a behaviour, symptom or outcome you could point at
   on a screen. Not a feeling about the software.
2. **Located.** From the issue plus the code, you can tell which app, page or
   flow it concerns.
3. **Checkable.** You can write the "Done when…" lines yourself, and he would
   recognise them as what he meant.
4. **One reading.** Two developers given only this text would build the same
   thing.

**Needs grilling** — any one of these:

1. It names a feeling or a verdict — "make it better", "stop sucking", "clean
   this up" — with no symptom attached.
2. There are two plausible readings that lead to different builds.
3. It names a place but not a change, or a change but not a place.
4. It needs a product decision: several behaviours would satisfy the words, and
   picking one is picking for him.
5. You would have to invent acceptance criteria he never implied.
6. It is a preference — wording, ordering, layout — and no preference is stated.

**The test, before you write any code:** draft the "Done when…" lines. If you
cannot write them without guessing what he meant, it is not ready. If you can
write them but would not bet he would agree, it is not ready either.

**These are NOT reasons to grill**, and treating them as such turns the safety
valve into a way of never building anything:

- **Thin.** A single dictated sentence naming a real symptom is buildable. Short
  is not ambiguous.
- **Big.** Size is not ambiguity. A large, clearly-specified job is ready.
- **Unfamiliar code.** That is research you should go and do, not a question for
  him.
- **You can see more than one way to implement it.** Choosing between
  implementations is your job; choosing between intents is not.

When you do move something to `needs-grilling`, comment with **the single
specific question that blocked you** — not a list, and not a restatement of the
issue. One question he can answer in a sentence.

### Never invent work

The queue is open issues in `repos.txt`. That is the whole of it.

- **Do not file new work items.** Not wishlist ideas, not refactors, not "while
  I was in here I noticed". If you find something worth saying, say it as a
  comment on the issue you are working.
- **Do not widen an item** beyond what it asks for.
- **Do not go looking** for something to do when the queue is empty. An empty
  night is a correct and complete outcome — stop and report it.

Two narrow exceptions, both reports rather than work: a **defect you actually
reproduced** while building may be filed as one issue with its reproduction, and
the **coverage issue** in step 4 records a scan that could not see everything.

## 2. Work the queue

Follow `/backlog-work` for each item, with these differences because nobody is
watching:

- **Never ask.** If an item is ambiguous enough that you'd want to ask, it isn't
  ready. Move it to `needs-grilling`, comment saying which specific question
  blocked you, and go to the next item. This is the safety valve that lets
  everything default to buildable — use it rather than guessing at intent.
  Building the wrong thing costs more than waiting a day.
- **Merge your own work** once CI is green. That is the standing instruction.
  Squash-merge, delete the branch.
- **Never merge on red CI.** Fix it, or if you can't, leave the PR open, label
  the issue `blocked`, comment why, move on.
- **Never touch, in any repo:** GitHub Actions workflow files, secrets,
  `.github/` permissions, branch protection, or anything under `.quartz/plugins/`.
  If an item needs one of those, label it `blocked` with a comment saying it
  needs a human, and move on.
- **No merge cap.** Keep going until the queue is empty or the session runs out
  of budget (context or usage limit). Isaiah removed the old five-a-night cap on
  2026-09-23. Because the run can be cut off mid-item, leave the issue's
  progress comment current as you go, so an item cut off is labelled
  `in-progress` and gets resumed the next night instead of lost.

### Build in batches of three, one sub-agent per item

**You are the coordinator. You don't write code.** Each item is built by its own
sub-agent (the `Agent` tool), so one item's files, test output and CI logs never
land in your context, and a long night doesn't run out of room.

1. Take the **top three** from the ranked list. Prefer three different repos. Two
   items in the same repo only if they plainly touch different files;
   otherwise take the next item instead and leave that one for a later batch.
2. For each, read the issue body and comments, and apply the readiness test. An
   item that fails it goes to Grill and the next ranked item takes its slot.
3. Launch the three sub-agents **at the same time** (all `Agent` calls in one
   message). Each prompt must stand alone:
   - the repo and issue number, and the one-line reason it was ranked here;
   - "Follow `.claude/commands/backlog-work.md` from
     BarkernotBob/BarkernotBob.github.io, plus the rules in step 2 of
     `.claude/commands/backlog-nightly.md` (never ask, merge on green, never on
     red, never touch workflows/secrets/`.quartz/plugins/`). The repo's own
     `CLAUDE.md` is the authority on how to build.";
   - "GitHub MCP schemas are deferred — load them with `ToolSearch` first.";
   - "Work in your own checkout (`git worktree add` or a fresh clone under
     `/tmp/nightly/<repo>-<issue>`), on branch `nightly/<issue>`. Before
     merging, bring in the latest default branch and re-run checks.";
   - "Keep the issue's progress comment current as you go. If you run low on
     room, stop, leave the issue `in-progress` with a note on exactly where you
     stopped.";
   - "Reply in at most 10 lines: `merged <PR link>`, `blocked: <why>`,
     `needs-grilling: <the one question>`, or `stopped: <where>`."
4. **Wait for all three to finish before starting the next batch.** Then act on
   each reply: a `needs-grilling` or `blocked` item gets its label and comment
   if the sub-agent didn't add it. Then take the next three.

A batch that finishes means three items shipped or cleanly parked. If the night
ends mid-batch, at most three items are open, each with a note saying where it
stopped. Never have more than one batch running.

## 3. Open a chat for every question Isaiah has to answer

Two kinds of item end the night waiting on Isaiah, and **each gets its own chat**:

- **Grill** — every `needs-grilling` item.
- **Blocked** — every item _this run_ labelled `blocked` because it needs a
  decision or action from him (red CI you could not fix, a workflow/secret/
  settings change, anything you would otherwise have asked). Title it
  `Blocked: <issue title>`, tag `["backlog-blocked"]`, and brief it with what
  you tried, exactly what is blocking, and the one thing you need from him.
  Items that were already `blocked` before tonight have been asked; leave them.

### Load the chat tool before deciding you can't

`create_session` and `list_sessions` come from the **Claude Code Remote**
connector, and like the GitHub tools their schemas are deferred. Load them
first: `ToolSearch` with `select:mcp__Claude_Code_Remote__create_session,mcp__Claude_Code_Remote__list_sessions`
(if that finds nothing, search `create_session`). If they load, open one chat
per item as below.

**In the scheduled Routine they will not load, and nobody can fix that.** The
Routine is made on the web page (it has to be, to have every repo attached),
the web page cannot attach Claude Code Remote, and a Routine Claude creates
cannot carry it either (tried 2026-09-23: `create_trigger` stores no
connectors). So in the Routine, **this run's own chat is where Isaiah answers**:

1. During the run, never stop to ask. Put the single blocking question on each
   issue as a comment, label it, and keep working.
2. After everything else is done — queue worked, report written, notification
   sent — end the run with a message titled **Questions for you**: a numbered
   list, one line per Grill/Blocked item (repo, issue number, title), then the
   **first** item's question in full. Ask it in plain chat text, not with
   `AskUserQuestion`, then stop.
3. The notification says how many questions are waiting in this chat.
4. When Isaiah replies (it may be hours later), you are in the same chat with
   every repo still attached. Run the `/backlog-grill` protocol on that item,
   following its question rules, and when it is pinned down, update the issue, drop
   the `needs-grilling`/`blocked` label, and move to the next item. Build it
   only if he says to; otherwise the next nightly run picks it up.

### Opening a grill chat

For each `needs-grilling` item, use `create_session` to start a separate chat:

- **title:** `Grill: <issue title>`
- **tags:** `["backlog-grill"]`
- **prompt:** a standalone briefing — the repo and issue number, the full issue
  body, what you found when you looked at the relevant code, and the instruction
  to run the `/backlog-grill` protocol starting with the single most important
  question. Tell it to follow `/backlog-grill`'s question rules.

**Tell it to ask in plain chat text, not with the question tool.** End the
prompt with this instruction, verbatim:

> Ask your questions as ordinary chat messages, then stop and wait for the
> reply. Questions that don't depend on each other go together in one numbered
> list, each with your recommended answer. Do not use the `AskUserQuestion` tool.

These chats run in auto permission mode, where `AskUserQuestion` needs an
approval nobody is awake to give. A chat that reaches for it freezes on a
permission prompt instead of asking — it looks like it is waiting for an answer
when it is really waiting to be allowed to speak. A plain chat message needs no
permission and reaches him the same way.

It sits in the Claude app until Isaiah opens it.

**Don't create a second chat for an issue that already has one** (grill or
blocked). Match on title, not tags: `list_sessions` currently rejects its `tags` filter outright
(`tags filter is not currently available`), so a tag-based check does not return
an empty list — it errors, and an error swallowed here means a duplicate chat
every night for the same issue. Instead list recent sessions without a filter
and compare titles against `Grill: <issue title>` / `Blocked: <issue title>`. If that exact title is
already there, skip the item — it has been asked.

## 4. Report

Two audiences, and the split is deliberate: the notification is counts, the
issues carry the detail.

### The notification

One push notification, at most three lines: how many merged, how many blocked,
how many chats are waiting, and coverage as **three numbers, never one** —
`18/18 covered · 2 opened · 2 audited`.
Do not put private repo names or issue titles in it — just counts. The one
exception is the access reminder below, which Isaiah asked for by name.

- **covered** — every repo in `repos.txt` the run can account for: `read`,
  `empty` and `assumed`. Only `unreachable` subtracts.
- **opened** — repos actually attached and listed. Usually one or two.
- **audited** — repos opened purely to check the search was telling the truth.

**The fraction alone is forbidden.** Under search-first, `covered` is 18/18 on
almost every night, including a night when nobody opened sixteen of those repos
— so on its own it means little more than "the run finished". `opened` and
`audited` are what say how much was actually seen, and they are the numbers that
would look wrong if the scan quietly stopped working.

If the audit caught the search missing an issue, the fraction is not the story —
say that instead, and in the notification. A scan caught missing work is a
broken run, not a quiet one.

Always send the coverage fraction, including on a night when everything was
reachable. `18/18` is a real result and takes one number; leaving it out when it
is clean means its absence is the only signal anything is wrong, and absence is
exactly what nobody notices.

### Remind Isaiah to add access for any repo you can't reach

Only Isaiah can give a Routine access to a repo, so a new project stays
invisible until he's told. Find every repo that needs it:

1. **In `repos.txt` but refused** — every `unreachable` repo.
2. **A new project not in `repos.txt` at all** — run `search_repositories` with
   `user:BarkernotBob archived:false fork:false` and take any repo it returns
   that isn't in `repos.txt`. Open a PR adding each to `repos.txt` (sorted),
   and merge it once CI is green. It's his repo, and an issue he files there
   must not be invisible. (Unproven: the search may only return repos this
   Routine can already see. Case 1 is the reliable path, which is why new
   projects get added to `repos.txt` when they are created.)

For each one, add a line to the notification — this is the one place a repo
name goes in it:

```
Add access: BarkernotBob/<repo> → https://claude.ai/code/routines/trig_01CAkWWvfRJwKKVyHFMoCGaV then Edit → + → pick the repo → Save
```

Then the same line with the monthly sweep's page,
`https://claude.ai/code/routines/trig_017f6WzFdjz8ZxFqWmN3A6jo`. Repeat it
every night until the repo is reachable. If there are more than three, name
three and say how many more are on the coverage issue.

### If any repo was unreachable

The fraction says _how many_; it can't say _which_, because names don't go in a
notification. So the names go on an issue, where they're durable and next to the
work:

1. Look for an open issue in `BarkernotBob/BarkernotBob.github.io` titled
   **`Nightly pass could not reach every repo`**.
2. If one exists, add a comment: tonight's date, the repos missed by name, and
   whether each was refused once or twice.
3. If none exists, file it with that exact title and label it **`hold`**.

`hold` is deliberate. This is a platform limitation, not buildable work — a
later pass that picked it up would try to build a fix for a classifier it
doesn't control. `hold` keeps it visible on the board and out of the queue.

Reuse the existing issue rather than filing a new one each night, or a bad week
produces seven issues saying the same thing.

### Never report a blind spot as a quiet night

A repo you could not attach has **unknown** contents, not empty ones — and
under search-first, a repo nobody opened is only as trustworthy as the search
plus that night's audit. If the queue came back empty, say which case it was:

- _"No open issues anywhere in scope"_ — only if coverage was complete.
- _"No open issues: the search found none, 2 audited repos agreed, 0
  unreachable"_ — the normal quiet night under search-first.
- _"No open issues in the 15 repos I covered; 3 unreachable, listed on the
  coverage issue"_ — whenever something could not be reached.

Then end the run. Everything else you have to say goes on the issues themselves,
where he'll find it next to the work.
