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

## Prototype round 2 (2026-10-11): three riffs on A, built

A stays the fallback. Build three new designs that keep the "app" feel (custom renderer, tappable
cards, big action buttons) but each look clearly different from A in style, colour, layout, even
function:
1. **Ultra safe** — calm, conventional, nothing that could confuse; polish over novelty.
2. **Slightly out on a limb** — one or two bolder ideas in layout or interaction.
3. **Off the wall** — experimental; break the dashboard mould entirely.

Same three pages (hub, project note, item note), same snapshot and pretend labels, screenshots at
phone and desktop (≥1300px), notes installed into `KnoxLox/Dev Hub prototype/` alongside A.
Then Isaiah picks, and on to `/to-spec` and `/to-tickets`.

Built (same branch and folder; notes in `KnoxLox/Dev Hub prototype/D - Calm`, `E - Focus`, `F - Messages`):
- **D "Calm"** (ultra safe): Settings-app grouped lists, one blue accent, small status dots. Hub
  lists the actual items that need you (Urgent / Grill / Test / Blocked, 5 each + "Show all");
  projects on the right. Item page: prose left, sticky card right with one big button.
- **E "Focus"** (out on a limb): always dark, neon per bucket. Hub is one item at a time ("Up
  next", ‹ › to cycle, filter chips, buttons right on the hub) plus a swipeable strip of project
  rings. Project = board of bucket columns with inline buttons. Item = action dock pinned to the
  bottom on phone, with "Next up" on desktop.
- **F "Messages"** (off the wall): the backlog as a chat app. Hub = conversation list (pinned
  "Needs you" thread, unread badges, live search); desktop shows the open thread beside it. A
  project is a thread: shipped items as green bubbles, open items as messages with quick-reply
  buttons, most urgent at the bottom where it opens. Item = your issue as a blue bubble, Claude's
  latest comment as the reply, action bar pinned to the bottom.

## Prototype round 3 (2026-10-12): verdict on round 2, and three new designs

Isaiah's verdict on round 2: **A is still the favourite.** E's more refined look is liked, but:
- **No dark mode, ever.** Every design is light, whatever the Obsidian theme.
- **E traded away clarity.** Bring it back: never scroll sideways, show full titles (no "…"),
  label every count and button, don't hide the queue behind one-at-a-time cycling.

Built (notes in `KnoxLox/Dev Hub prototype/G - Bright`, `H - Workspace`, `I - Briefing`):
- **G "Bright"**: A's layout with E's polish. Hub = three big Grill/Test/Blocked tiles that filter
  one full list of everything that needs you, every row with its button; project cards with
  labelled counts. Project = sections by status. Item = coloured header card with big buttons.
- **H "Workspace"**: a Mail/Things-style app. Desktop is three panes (lists | items | the item)
  so you never leave the page; phone drills in one pane at a time like Mail.
- **I "Briefing"**: reads like a morning paper. A plain-English summary ("32 things need you…
  start with blockchain"), then one story per project with its top 3 numbered items and buttons;
  an "At a glance" table on the side. Item = article with the open questions below.

## Prototype round 4 (2026-10-12): verdict on round 3, and the brief for round 4

Isaiah's verdict on round 3:
- **I "Briefing": no.** Drop it.
- **G:** keep the **Grill / Test / Blocked filter tiles** at the top.
- **A:** keep the **easy jump into a project** (one click from the hub to a project).
- **H's sidebar is the base.** "If we did a few things, that could be a real winner":
  1. **Progress bars under each project in the sidebar**, the stacked colour bar from A's hub
     project cards (`a_view.js`, `.dha-bar`: one segment per status, sized by count). The
     sidebar may get a little wider and each project row a little taller to fit it.
  2. **Grill and Blocked need clearly different colours.** Today both are orange-red
     (A: `#e8590c` vs `#e03131`; G/H: `#ee6a1f`/`#e8641c` vs `#e23c55`/`#df3a52`).
     They should not look like neighbours on a bar.
  3. **Push-and-pull panes (desktop).** The item viewer on the right stays fixed in place and
     size. The two left panes (lists sidebar and items list) share a fixed total width: one is
     expanded, the other squished but **still visible** (not hidden). Hovering the squished one
     expands it and squishes the other. The viewer never moves.

Round 4 = **3 more prototypes (J, K, L)** that riff on the above: all are H-based with points 1–3,
G's filter tiles and A's project jump. Each one also riffs differently on the visual styling:
colour palette, icons, sizes and shapes. Same rules as round 3: always light, no sideways
scrolling, full titles, every count and button labelled.

Assumptions to confirm with Isaiah in the round-4 session (not decided by him):
- **Phone has no hover.** Default: keep H's phone drill-in (one pane at a time). One prototype
  could try a tap-to-swap version of push-and-pull.
- **Squished pane content.** Default: the squished sidebar shows icons + counts + the progress
  bars; the squished items list shows a narrow strip of coloured dots + short titles.

Isaiah's answers (2026-10-12):
- **Phone:** J and K keep H's phone drill-in. L tries tap-to-swap (tap the squished strip to expand it).
- **Squished panes:** sidebar shows icons + counts + progress bars; items list shows coloured dots +
  short titles (the one allowed exception to "full titles"; hovering/tapping shows them in full).
- **Default + no snap-back:** the items list starts expanded; panes stay however the mouse left them.

Built 2026-10-12: J "Studio" (soft cards, amber Grill / red Blocked), K "Blocks" (bold borders, solid
tiles, orange Grill / charcoal Blocked), L "Pebble" (round pills, tiles band across both left panes,
grape Grill / red Blocked, tap-to-swap on phone). Installed in KnoxLox → `Dev Hub prototype/J–L`.
Shots: `backlog/prototypes/dev-hub/shots/{J,K,L}-*.png`. K was meant to use Obsidian's line icons, but
they can't be reached from a dataview view, so it shows emoji like J and L.

## Prototype round 5 (2026-10-12): verdict — J "Studio", with tweaks

Isaiah picked **J**. Tweaks, all built in the prototype:

- **Desktop**
  1. Grill/Test/Blocked tiles sit in a band across the top of both left panes (like L), so push-and-pull never resizes them.
  2. The squished items pane keeps its grey sub-line (one line, cut off with "…").
  3. A grabbable line between the left panes and the reader resizes their total width. Wide enough for both
     (≥720px) → they lock side by side; too narrow for push-and-pull to matter (≤400px) → they lock at half each.
     Either lock stops the open/close move. Double-click the line to reset. The width is remembered.
  4. No Properties block on any Dev Hub note.
  5. On an item: Mark/Remove urgent, Move to top, Move to bottom (within that project's group).
     **Decided (2026-10-12):** the urgent button just opens the issue on GitHub; Isaiah sets the label there.
     The hub stays one-way. **Open:** Move to top/bottom has no GitHub equivalent (issues have no order).
- **Phone:** back buttons are bigger (44px), styled like the app's other buttons.

## Next step

Isaiah answers the write-back questions (round 5, item 5), then `/to-spec` and `/to-tickets`.
