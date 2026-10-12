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

## Prototype round 1 (2026-10-11): verdict — A "App"

Three designs were built as real vault notes from that day's issues (branch `prototype/dev-hub`,
code in `backlog/prototypes/dev-hub/`, notes in `KnoxLox/Dev Hub prototype/`):
A "App" (custom cards, one dataviewjs renderer), B "Sortable" (native Bases tables + Meta Bind),
C "Plain" (markdown lists). **Isaiah picked A.** B lost on phone (tables show one column; a
properties wall opens every item). C works but reads like a long list.

Findings that carry forward:
- **Grill / Pass / Fail link:** `claude://code/new?q=<prompt>&folder=<abs repo path>` opens a new
  Claude Code session in the Mac app with the prompt pre-filled (read from Claude.app's code, not
  yet clicked). Phone unverified, so every action also has a Copy button.
- Dataview JS renders in reading mode on phone and desktop; no CSS snippet needed (`view.css`
  next to the renderer loads itself).
- Snapshot + screenshots stay local (gitignored): they hold private-repo issue text and this repo
  is public.

## Next step: `/prototype` round 2 — three riffs on A

A stays the fallback. Build three new designs that keep the "app" feel (custom renderer, tappable
cards, big action buttons) but each look clearly different from A in style, colour, layout, even
function:
1. **Ultra safe** — calm, conventional, nothing that could confuse; polish over novelty.
2. **Slightly out on a limb** — one or two bolder ideas in layout or interaction.
3. **Off the wall** — experimental; break the dashboard mould entirely.

Same three pages (hub, project note, item note), same snapshot and pretend labels, screenshots at
phone and desktop (≥1300px), notes installed into `KnoxLox/Dev Hub prototype/` alongside A.
Then Isaiah picks, and on to `/to-spec` and `/to-tickets`.
