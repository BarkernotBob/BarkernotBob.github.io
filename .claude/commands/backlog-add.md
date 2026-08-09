---
description: File one or many backlog items from a dictated or pasted list, into the right projects
argument-hint: "<anything — one item, a list, dictated notes>"
allowed-tools: Bash, Read, Glob, Grep, mcp__github__issue_write, mcp__github__list_issues, mcp__github__search_issues, mcp__github__get_file_contents
---

File everything in here as issues: $ARGUMENTS

If that's empty, ask what to add — one short question — then carry on.

## Reading and writing GitHub

There are two ways to reach GitHub and only one works in any given session:

- On Isaiah's Mac, the `gh` CLI is installed — use it.
- In a cloud session there is no `gh` — use the GitHub MCP tools (`mcp__github__*`),
  and `add_repo` any repo this session doesn't already have.

Run `command -v gh` once at the start, pick the one that's there, and stick to it.

## How to read the input

It arrives however it arrived — a tidy list, a run-on sentence, a voice
transcript with no punctuation. Split it into separate items yourself. Bullets,
"and then", "also", and sentence breaks are all item boundaries. When you can't
tell whether something is one item or two, make it one; splitting later is
cheaper than a duplicate.

Do not interview him. This command exists so a thought can be dumped and
forgotten. Every question you ask defeats it.

## Where each item goes

`backlog/repos.txt` in `BarkernotBob/BarkernotBob.github.io` is the list of
projects. Match each item to one by what it mentions — pool, grocery, vehicle,
trashback, bank bonus, tax, Logos, Obsidian, the site itself, and so on. The
website repo holds several tools, so anything about the site, its pages, styling
or publishing goes there.

If an item genuinely doesn't match any project, file it in the website repo and
say so in your summary. Don't stall the whole batch on one unclear item.

## Writing the issue

- **Title:** his words, tightened to a line. Don't editorialise it into
  something he wouldn't recognise.
- **Body:** what he said, verbatim, under `**What you asked for**`. If he gave
  acceptance criteria, put them under `**Done when...**` as a checklist. If he
  didn't, leave that heading out — don't invent criteria, and don't pad.
- **Labels:** none, normally. An open issue with no label is a planned item and
  the nightly routine will pick it up. Two exceptions:
  - too vague to build as written → `needs-grilling`
  - he said not to start on it yet → `hold`
- Never set `in-progress` or `blocked` here. Those mean work has started.

Check for an obvious duplicate in the target repo before creating each one. If
you find a real duplicate, comment on the existing issue instead and say so.

## Report back

One compact list, nothing else:

```
pool-data #12  Show chlorine dose to one decimal
grocery-data #4  Pantry list scrolls to the top when you tick something
BarkernotBob.github.io #7  Home splash cards are cramped on iPhone  (needs grilling)
```

Then one line: how many filed, and anything you had to guess at. If you flagged
something `needs-grilling`, say which and why in half a sentence — that's the
one thing worth his attention.
