# Grocery Tracker — S3 design sign-off mockup

This is the **FR‑34 sign-off gate** deliverable from the v2 PRD
(`grocery-data` → `docs/PRD.md`, §9 "Grocer's Ledger" + §9.9): a **style tile**
plus the composed **Today** screen, in **both themes (Paper / After Hours)**.
Nothing is coded into the live app yet — this is the design to approve *before*
Phase‑1 rollout.

## What's here
- `today-mockup.html` — self-contained, interactive. Real typefaces (Fraunces,
  Archivo, IBM Plex Mono) embedded as WOFF2 data URIs (~100 KB, within the PRD's
  ≤180 KB budget), so what you see is what ships. Open it in any browser.
- `today-light-dark.png` — the Today screen, light and dark, full scroll.
- `style-tile.png` — palette (both themes), type, stamps, provenance, shelf-life
  bar, buttons, app icon.

## Decisions captured
- **Name: "Grocery Tracker"** (PRD open question D‑1) — chosen by owner, 2026‑07‑05.
  ("Larder" not adopted.)

## Design intent (per PRD §9)
Warm paper ground (never white-on-cool-gray), ink hairlines, statuses as bordered
**stamps** (not pastel pills), money/dates/qty in mono tabular figures, a single
Fraunces hero figure per screen, and bespoke domain components — the 4-segment
shelf-life bar (leaf→marigold→tomato, always paired with a date stamp) and
SYNC/SNAP/MAIL provenance stamps. Zero emoji.

## Owner action
Approve as-is, or note changes. Your approval note is the recorded sign-off
(PRD §9.9). Once approved, the next build slice (S3) turns these tokens into
`tokens.css` + the real Today screen.

_Provisional colors: all hex values are validated against WCAG AA at build time
by the CI contrast check (PRD §13 class 6) before shipping._
