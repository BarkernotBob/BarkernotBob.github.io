# Glossary

Terms used across this repo. Add to it as decisions get made.

## Book club scheduler (`/static/bookclub/`)

- **Club** — one shared calendar, picked by `?club=` in the URL (default `bookclub`).
- **Time box** — one hour on the weekly calendar, Mon–Sun, 7 AM–11 PM, Eastern Time.
- **Meeting rhythm** — how often a person can commit to meeting: every 2, 3 or 4 weeks. Each person
  picks the most often they can manage; the group's rhythm is the least frequent pick.
- **Reading time** — hours a week a person can read (1–10+).
- **Best time** — a run of time boxes on one day where the same people are free the whole way.

## Dev Hub (`backlog/` → the KnoxLox vault)

Being grilled 2026-10-11; terms settle here as decisions land.

- **Dev Hub** — a read-only mirror of every project's work, written into the Obsidian vault
  (`Dev Hub/`) so it reads on phone and desktop. Generated, never hand-edited; GitHub stays the
  source of truth. Only flows one way (GitHub → vault).
- **Hub** — the dashboard note at the top of `Dev Hub/`: every project with open items and its
  bucket counts. Custom app look, built in Obsidian.
- **Project note** — one per repo; lists its items, sortable (Needs you first by default), with
  completed work reachable from it.
- **Item note** — one note per issue or local ticket, so items can be linked to. Shows title, status,
  first paragraph and any open-questions comment word for word. No AI rewriting.
- **Sources** — GitHub Issues only. Local `issues/*.md` tickets are being moved into GitHub
  (BarkernotBob/claude-setup#1); the Dev Hub doesn't read them. Test = the `needs-test` label.
- **Buckets** — *Needs you*: Grill · Test · Blocked. *Claude's queue*: Urgent · Ready to build ·
  In progress. *Parked*: hold. *Shipped*: closed in the last 7 days — secondary, never front and center.
- **Ready** — open, no status label: the nightly will build it when its turn comes.
- **Parked** — `hold` label: set aside on purpose; the nightly leaves it alone.
- **Sort order** — Urgent first (whatever its bucket), then Grill → Test → Blocked → In progress →
  Ready → Parked → Done; oldest first within each. Any column can still be re-sorted.
- **Grill button** — opens a Claude chat pre-filled with `/backlog-grill <issue link>` (fallback: copy
  the command and open the Claude app). A smaller GitHub link sits beside it.
- **Pass / Fail buttons** — on a Test item, open a Claude chat saying it passed or failed; Claude
  updates the ticket. The hub itself never writes back.
- **Completed item** — title, date closed, the merged PR's title as "what was done", GitHub link.
  Kept forever, newest first, collapsed on the project note. Local tickets use their
  "Verified by Claude" lines.
- **Refresh** — once a day. If a day's refresh hasn't succeeded (Mac asleep or off, network down),
  it runs the next time the Mac is open, so it can't fail silently day after day. Plus an Obsidian
  refresh command. The phone shows a "Last updated" stamp. No Raycast command.
- **Look** — "app" style: a custom renderer with tappable cards and big action buttons (prototype
  A, picked 2026-10-11). Not native Bases tables, not plain lists.
- **Home** — code in `backlog/` of this repo. The Dev Hub replaces `BACKLOG.md`; `/backlog` stays.

## Driveline (`/static/vehicle/`)

Cost-model terms (2026-10 Leaf audit). Isaiah's facts:

- **Isaiah's driving** — about 4,000 mi/yr, trips ≤25 mi, Fort Wayne, Indiana, with a daily-use
  home outlet for charging.
- **Seed data provenance** — the seed rows' insurance figures are Isaiah's real quotes, the
  registration figures come from Isaiah's own research, and the mileage comes from CarEdge. Leave all
  three alone when tuning the model.
- **Today's dollars** — model v2 defaults inflation to 0%, so running costs sit on the same footing
  as resale. Saves made before v2 (`settings.modelV` missing) with the old 3% default are moved to 0
  once. A rate the user types afterwards is kept.
- **Time-based maintenance share** — the part of maintenance you pay however little you drive (age,
  rubber, 12V battery, coolant, inspections). Default 40%, editable in Settings → Model tuning. The
  rest scales with miles.
- **Cost of cash** — what the money tied up in the car would earn elsewhere. Charged yearly on
  resale minus loan balance; default 1%/yr.
- **Floor decay** — past the oldest model year CarEdge measured, the fitted value floor keeps
  shrinking, so a 20-year-old car keeps losing value instead of flattening.
- **Edge pick** — a lowest-cost plan that uses the oldest model year or the longest hold. It
  depends on the extrapolated curve and carries a warning.
- **Price override (EV)** — an EV's per-car override is in $/kWh, while a gas or hybrid car's is in
  $/gal. Switching a car between EV and non-EV clears it.
