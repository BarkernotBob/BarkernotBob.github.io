# Setting up the Routines

You need to do two things: **start the right kind of chat**, then **paste one
prompt into it**. The chat does the rest, including deleting the broken Routines.

Total hands-on time: about a minute.

---

## Why it has to be a new chat

A Routine keeps whatever tools the chat that created it had, forever. The old
Routines were created from a chat with no GitHub tools, so every night they woke
up unable to see a single issue. There is no way to add tools to an existing
Routine — it has to be created again, from a chat that has them.

A chat gets GitHub tools by having this repository attached when it starts. That
is the only step that matters.

---

## Step 1 — start the chat

Open **https://claude.ai/code**, then:

1. Click **New session**
2. Under **Repository**, choose **BarkernotBob/BarkernotBob.github.io**
3. Leave the branch as **main**
4. Start the session

Do **not** use a plain claude.ai chat, and do not use the Routines settings page.
Neither attaches the repository, which is the whole point.

## Step 2 — paste this

Copy everything between the lines and send it as your first message.

---

You are setting up two scheduled Routines. Work through this in order and stop at the first step that fails — a Routine created without the right tools looks fine and silently does nothing, which is the exact bug we are fixing.

**Step 1 — check your own tools.** Confirm you have `mcp__github__*` tools, `add_repo`, `create_session`, `create_trigger` and `delete_trigger`. Then list the open issues in `BarkernotBob/BarkernotBob.github.io` and tell me how many you see. If any tool is missing or the call is refused, stop here and tell me — do not create anything.

**Step 2 — prove a spawned worker inherits those tools.** This is the part that has failed before, so verify it rather than assuming.

- Open a new issue in `BarkernotBob/BarkernotBob.github.io` titled `Routine plumbing check` with a one-line body saying what it is for. Label it `hold`.
- Use `create_session` to spawn a worker, with `source_url` set to `https://github.com/BarkernotBob/BarkernotBob.github.io`, titled `Plumbing check worker`, and this as its prompt:

  > Report your GitHub capability, then stop. Do not do any other work. Specifically: (a) list which of `mcp__github__*`, `add_repo` and `gh` you actually have; (b) count the open issues in `BarkernotBob/BarkernotBob.github.io`; (c) try `add_repo` on `BarkernotBob/bank-bonuses` and say whether it succeeded. Post all three answers as a single comment on issue `Routine plumbing check` in `BarkernotBob/BarkernotBob.github.io`, then stop.

- Wait for that comment to appear on the issue, checking every 30 seconds for up to 5 minutes. Read it when it arrives.
- If the worker reports it has the GitHub tools and could add the second repo, continue. If it reports it has none — the old failure — **stop and tell me**, and say specifically what it was missing. Do not create the Routines; we would just be rebuilding the same broken thing.
- Close the `Routine plumbing check` issue either way.

**Step 3 — delete the two broken Routines.**

- `trig_015mh7Dy3W3V42rhdWCt5X9F` — "Nightly backlog"
- `trig_018KFdmKDquYi7UWRup93cGT` — "Monthly branch sweep"

**Step 4 — create the replacements, bound to this session.** Use `create_trigger` with **no** `persistent_session_id` and **no** `create_new_session_on_fire`, so each firing resumes this chat and inherits the tools you just verified.

Both Routines follow the same pattern: **this session does no work.** On each firing it spawns a fresh worker with `create_session` and stops. That keeps this chat small — a bound Routine resumes the same conversation every time, and a month of full backlog runs in one transcript is a month of context re-read on every subsequent run.

Routine 1 — name `Nightly backlog`, cron `0 6 * * *`, initiation `human_request`, prompt:

> Spawn tonight's backlog worker and stop. Do not do the run yourself. Read `backlog/routines/nightly-backlog.md` from `BarkernotBob/BarkernotBob.github.io` on `main`, and use `create_session` with `source_url` set to `https://github.com/BarkernotBob/BarkernotBob.github.io`, title `Nightly backlog — <today's date>`, tags `["backlog-nightly"]`, and everything below that file's `---` divider as the prompt. Then stop. If the file is missing, send a notification saying so and stop.

Routine 2 — name `Monthly branch sweep`, cron `0 7 1 * *`, initiation `human_request`, prompt:

> Spawn this month's branch-sweep worker and stop. Do not do the sweep yourself. Read `backlog/routines/monthly-branch-sweep.md` from `BarkernotBob/BarkernotBob.github.io` on `main`, and use `create_session` with `source_url` set to `https://github.com/BarkernotBob/BarkernotBob.github.io`, title `Branch sweep — <this month>`, tags `["branch-sweep"]`, and everything below that file's `---` divider as the prompt. Then stop. If the file is missing, send a notification saying so and stop.

**Step 5 — test the whole chain end to end.** Use `fire_trigger` on the branch-sweep Routine now. It is the safe one to run on demand: it only deletes branches whose work has already landed on `main`, and files an issue about anything that needs a decision. Watch for the worker session to appear and report its counts.

**Step 6 — tell me, in plain English:** whether the workers can reach GitHub, what the branch sweep found, and both new Routine IDs. Keep this chat open — the Routines are bound to it.

---

## Step 3 — afterwards

Leave that chat alone. Don't archive it, don't clear it — the Routines fire into
it. If it is ever deleted, run this setup again from Step 1.

Both new Routine IDs will be in the chat's final message. Add them to
`HANDOFF.md` so the next person looking at this knows where they live.

## How to tell it is actually working

Check the morning after the first run. You should get a push notification with
counts in it — repos read, issues found, issues built. **Counts are the signal.**
A run that reports no counts, or just says it finished, is the old failure coming
back, and it means the chat it is bound to has lost its tools.
