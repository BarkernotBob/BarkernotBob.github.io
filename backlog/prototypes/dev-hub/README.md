# PROTOTYPE: Dev Hub (throwaway, never merges to main)

Question: what should the Dev Hub (hub / project note / item note) look like in Obsidian, on phone and desktop?
Brief: `DEV-HUB-SCOPE.md` → "Next step".

- `snapshot.sh`: one-shot `gh` snapshot of every repo in `backlog/repos.txt` into `snapshot.json` (+ `prs.json`).
- `gen.py <vault> [letters]`: writes `<vault>/Dev Hub prototype/<letter folders>/` (default all, ABCDEFGHIJKL).
  - A: one dataviewjs renderer (`a_view.js`/`a_view.css`) for all pages.
  - D "Calm", E "Focus", F "Messages" (round 2): same setup, `d_/e_/f_view.js` + `.css`.
  - G "Bright", H "Workspace", I "Briefing" (round 3, always light): `g_/h_/i_view.js` + `.css`.
  - J "Studio", K "Blocks", L "Pebble" (round 4, push-and-pull panes): ONE shared renderer `jkl_view.js` + layout
    `jkl_base.css`; gen.py appends `j_/k_/l_view.css` and passes `variant`. Squished-pane styles are container
    queries on `dxnav`/`dxmid` (≤200px); phone is `@container dxouter (max-width: 760px)`. `setIcon` isn't reachable
    from dataviewjs, so K falls back to emoji.
  - B: native Bases tables + Meta Bind buttons + callouts.
  - C: plain markdown, links as buttons, copy-block fallback.
- `shoot.mjs`/`ev.mjs`/`setup.mjs`: drive an isolated Obsidian (`--user-data-dir`, CDP port 9339) for screenshots.
- `shots/`: hub, project (blockchain), Grill item (logos-notes #15), Test item (site #202) × A–L × phone/desktop. `SHOOT_JS=<js> SUFFIX=-x node shoot.mjs …` runs JS before each shot (e.g. open the sidebar).
- Isolated Obsidian: vault `/tmp/devhub/vault` with only dataview copied in; `--user-data-dir=/tmp/devhub/ud`.
  Dataview caches `view.css`: after `gen.py`, reload the app (`node ev.mjs "setTimeout(()=>location.reload(),100); return 1"`).
  Dataview's block is `overflow:auto`, which kills `position: sticky` inside it; E and F override it.

Pretend labels so empty buckets show: site #202 and ytfree #2 = needs-test, blockchain #46 = urgent.
Grill/Pass/Fail link: `claude://code/new?q=<prompt>&folder=<path>` (found in Claude.app; Mac only verified from app code).
