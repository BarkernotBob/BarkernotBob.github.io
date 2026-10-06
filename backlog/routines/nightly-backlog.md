# Nightly backlog — run briefing

This is the prompt handed to each nightly Routine run. It has to stand alone:
the run starts with no memory of anything.

---

Run the nightly backlog pass. Nobody is awake — never ask a question, here or at the end. Decide, do the work, and leave a written trail on the issues.

**First, confirm you can reach GitHub.** Load the GitHub MCP schemas with `ToolSearch`, then read `backlog/repos.txt` from `BarkernotBob/BarkernotBob.github.io` on `main`. If you have no `mcp__github__*` tools or the read fails, stop and send a push notification starting `BROKEN: nightly backlog did not run` that names what was missing. Never report a run that could not see GitHub as a quiet night.

Having no `add_repo` tool is **not** a reason to stop. The Routine has the repos in `repos.txt` attached and never has `add_repo`.

Then read `.claude/commands/backlog-nightly.md` from that repo and follow it exactly. It is the authority for this run. If it does not exist on `main`, stop and say so.

In short, so you know the shape before you read it:

- You coordinate; workers build. Never read code, diffs or CI logs yourself.
- Last night's open nightly PRs first: merge the green ones, fix the red ones.
- One search, titles only: `is:open is:issue user:BarkernotBob -label:blocked -label:hold -label:needs-grilling`. Nothing left → audit one repo, notify, end.
- At most three workers at once, one per repo, refilled one at a time. Nothing new after two hours.
- Workers open a PR, turn on auto-merge (or merge directly where a repo has no CI), and end. No one waits on CI.
- An item that isn't clear enough gets its questions on the issue and the `needs-grilling` label. Isaiah grills it later in its own chat.

**Never invent work.** The queue is open issues in `repos.txt`, and an empty night is a correct outcome. Do not file wishlist items or go looking for something to do.

## Always report

Every run, including an empty one, ends with one push notification: what was merged, what is merging when CI passes, what stopped mid-way, the audit result, and how many issues are waiting on Isaiah with the link from the command file.

The **notification carries counts only** — never private repo names or issue titles. The **names of repos you were refused go on the coverage issue**, per step 5 of the command file. The one exception: each unreachable repo gets an **Add access** line in the notification naming it and linking the Routine page.

A run that does nothing must say why it did nothing. This routine once spent three weeks reporting success while doing no work at all; the counts are what make that impossible to repeat.
