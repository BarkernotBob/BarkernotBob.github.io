# PROTOTYPE: Dev Hub (throwaway, never merges to main)

Question: what should the Dev Hub (hub / project note / item note) look like in Obsidian, on phone and desktop?
Brief: `DEV-HUB-SCOPE.md` → "Next step".

- `snapshot.sh`: one-shot `gh` snapshot of every repo in `backlog/repos.txt` into `snapshot.json` (+ `prs.json`).
- `gen.py <vault>`: writes `<vault>/Dev Hub prototype/{A - App, B - Sortable, C - Plain}/`.
  - A: one dataviewjs renderer (`a_view.js`/`a_view.css`) for all pages.
  - B: native Bases tables + Meta Bind buttons + callouts.
  - C: plain markdown, links as buttons, copy-block fallback.
- `shoot.mjs`/`ev.mjs`/`setup.mjs`: drive an isolated Obsidian (`--user-data-dir`, CDP port 9339) for screenshots.
- `shots/`: hub, project (blockchain), Grill item (logos-notes #15), Test item (site #202) × A/B/C × phone/desktop.

Pretend labels so empty buckets show: site #202 and ytfree #2 = needs-test, blockchain #46 = urgent.
Grill/Pass/Fail link: `claude://code/new?q=<prompt>&folder=<path>` (found in Claude.app; Mac only verified from app code).
