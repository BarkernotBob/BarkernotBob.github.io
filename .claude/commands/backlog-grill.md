---
description: Turn a rough idea on the backlog into something buildable, by asking the hard questions
argument-hint: "<issue number, or nothing to take the oldest needs-grilling item>"
allowed-tools: Bash, Read, Glob, Grep, Skill, AskUserQuestion
---

Grill a rough idea until it's specific enough to build. Target: $ARGUMENTS — if
empty, take the oldest open item labelled `needs-grilling`.

## Reading and writing GitHub

There are two ways to reach GitHub and only one works in any given session:

- On Isaiah's Mac, the `gh` CLI is installed — use it.
- In a cloud session there is no `gh` — use the GitHub MCP tools (`mcp__github__*`).

Run `command -v gh` once at the start, pick the one that's there, and stick to
it. Every `gh ...` example below has a direct MCP equivalent.

If a `/grill-me` command exists in this setup, use it for the questioning itself
and use the rest of this file for what happens to the issue. Otherwise do the
questioning yourself.

## Before asking anything

Read the issue and its comments. Then go look at the actual code — the idea will
usually collide with something that already exists, and the collision is the
most useful thing you can bring to the conversation.

## The grilling

Ask one question at a time and wait. Never dump a list of six questions — this
gets answered on a phone, in bed.

Cover, in this order, stopping as soon as the answer makes the rest moot:

1. **The real problem.** What actually happens today that's annoying? Not the
   proposed solution — the thing that made them file it.
2. **Does something already do this?** Name the closest existing thing, in this
   repo or off the shelf, and say why it isn't enough. If it is enough, say so
   and recommend closing the issue.
3. **The smallest version that helps.** What's the one-sentence version they'd
   actually use? Push back hard on scope.
4. **Done when.** Concrete, checkable statements. Keep asking until each one is
   something they could verify by looking at the screen.
5. **What it must not break.** The thing they'd be annoyed to lose.

Use `AskUserQuestion` when there are real options to choose between. Recommend
one and say why. They're a beginner with Git and the command line — no jargon,
or define it on the spot.

## When it's pinned down

1. Rewrite the issue body in the shape of the **Planned change** form: what and
   why, `Done when...` as a checkable list, size, notes. Keep the original text
   at the bottom under `### Original idea`.
2. `gh issue edit <number> --repo <repo> --remove-label needs-grilling`. With
   that label gone it is a plain open issue again, which is all the nightly
   routine needs to pick it up next run.
3. Say plainly: it's ready, and it gets built tonight.

If the grilling shows the idea isn't worth doing, say so, and close the issue
with `--reason not-planned` and a comment explaining the reasoning.

If they stop replying, leave the issue exactly as it is. Don't guess the answers
and don't mark it ready.
