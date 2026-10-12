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
- **Sources** — GitHub issues plus each repo's local `issues/*.md` tickets, read from `main` on GitHub.
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
- **Refresh** — every 30 minutes while the Mac is awake, plus an Obsidian refresh command. The
  phone shows a "Last updated" stamp. No Raycast command.
- **Home** — code in `backlog/` of this repo. The Dev Hub replaces `BACKLOG.md`; `/backlog` stays.
