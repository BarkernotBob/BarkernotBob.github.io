# Dev Hub — v1 scope

Grilled with Isaiah 2026-10-11. Terms and every decision: the "Dev Hub" section of `GLOSSARY.md`.
Status lives in `HANDOFF.md`.

## The problem

Issues pile up across ~30 repos needing grilling, a test, or a decision. Isaiah works from his phone
or laptop and doesn't want to navigate GitHub to find what needs him.

## v1 (smallest version that's useful)

A read-only `Dev Hub/` folder in the KnoxLox vault (iCloud, so phone + desktop), regenerated from
GitHub Issues once a day by a script in `backlog/` on the Mac.

- **Hub** note: every project with open items and its bucket counts. Custom app look, in Obsidian.
- **Project note** per repo: its items, urgent first, then Grill → Test → Blocked → In progress →
  Ready → Parked; "Shipped this week" collapsed and secondary; completed work back to the start.
- **Item note** per issue (linkable): title, status, first paragraph, open-questions comment verbatim.
  No AI rewriting. Buttons: Grill (pre-filled Claude chat), Pass / Fail on Test items, small GitHub link.
- Refresh: daily, catch-up on next Mac open if a day was missed, plus an Obsidian refresh command,
  "Last updated" stamp. Only rewrite notes whose content changed (iCloud churn).
- Replaces `BACKLOG.md` (gitignored output of `backlog/backlog.py`). `/backlog` stays.

## Not v1

- Writing back to GitHub from Obsidian (one-way only, decided).
- Local `issues/*.md` tickets — being moved into GitHub first: BarkernotBob/claude-setup#1
  (`needs-grilling`). Until then the Test bucket only fills from a `needs-test` label that issue adds.
- Raycast command, push notifications.

## Next step: `/prototype` (Isaiah wants to see it before any spec or build)

- 2–3 designs for the hub, a project note and an item note, built as real vault notes from a
  snapshot of today's open issues (44 open, 81 closed on 2026-10-11).
- Screenshot each at phone and desktop (≥1300px) width. Phone layout: the Obsidian mobile CSS
  harness in Claude's memory (app.css from obsidian.asar + headless Chromium).
- Vault has Bases, Datacore, Dataview, Meta Bind and Buttons available — pick what renders on mobile.
- Find out whether a link can open a Claude Code chat with a pre-filled prompt (Grill / Pass / Fail
  buttons). If not, fallback: copy the command and open the Claude app.
- Then `/to-spec` and `/to-tickets`.
