# Grocery App v2 (“Larder”) — PRD pointer

**The full PRD lives in the private repo: `grocery-data/docs/PRD.md`.**

It is kept there deliberately: the PRD and its companions (retailer recon
notes, extension source, screenshots of real household data) must never be
published in this public site repo. Do not copy their contents here.

## What the PRD means for THIS repo

The implementing agent should read `grocery-data/docs/PRD.md` first, then do
the site-repo work it specifies:

- **App rebuild** at `quartz/static/grocery/` — the single-file app is split
  into no-build ES modules, becomes a real PWA, gets two separate shells
  (mobile ≤800px, desktop >800px), and adopts the “Grocer's Ledger” design
  system (PRD §8–§9). All data still comes from the grocery-data repo via the
  GitHub API.
- **Schema docs**: the canonical `staging-order.schema.json` lives in the
  grocery-data repo (`schema/`, beside the validators that consume it — PRD
  §10.1); this repo's `grocery-tool/schema/README.md` and
  `grocery-tool/PROCESSOR.md` document it and must be updated in the same
  changeset as any data change.
- **Regression suite** at `tests/grocery/` (repo root — NOT under
  `quartz/static/`, so it never deploys), wired into
  `.github/workflows/deploy.yml` as a path-filtered gate: build → test →
  deploy only on green. Uses synthetic fixture data only — never real
  household data in this public repo.
- **Removal** of the divergent, never-installed
  `grocery-tool/automation/process-receipts.yml` (PRD FR‑15).

## Hard rules carried over from the PRD

- No retailer endpoint details, recon notes, tokens, or real-data screenshots
  in this repo — it is public.
- Clicking must never reflow the UI (mechanically asserted in CI).
- No UI change is done until screenshotted at mobile + desktop widths in both
  themes and visually reviewed.
