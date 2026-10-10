# HANDOFF — barkernotbob.github.io (Quartz v5 site)

_Last updated: 2026-10-10_

## Current status

Live and healthy at https://barkernotbob.github.io. Quartz v5, deployed by GitHub
Actions (`.github/workflows/deploy.yml`) → GitHub Pages, ~5–6 min per publish.
Production branch is **`main`** (renamed from `v5` on 2026-08-06). If a deploy
ever fails with an empty log / `BlobNotFound`, check the `github-pages`
environment's deployment branch policy first — it produces a job with no steps.

## Scheduled Routines

At https://claude.ai/code/routines. Both were made from that page, not by
Claude, and have every repo in `backlog/repos.txt` attached.

| Routine              | ID                              | When             |
| -------------------- | ------------------------------- | ---------------- |
| Nightly backlog      | `trig_01CAkWWvfRJwKKVyHFMoCGaV` | daily, 2:00 AM   |
| Monthly branch sweep | `trig_017f6WzFdjz8ZxFqWmN3A6jo` | the 1st, 3:00 AM |

**Adding a repo to `repos.txt` means adding it to both Routines too**, or it
shows as unreachable every night. Rebuild steps: `backlog/routines/SETUP.md`.

The old Claude-made Routines are **paused, not deleted**:
`trig_01Nk8wjwLTac2qEe74oAMaq2` (nightly), `trig_018KFdmKDquYi7UWRup93cGT` and
`trig_011EexVvhG1Q3AFZNRTYHfVk` (monthly). Delete once the new ones have run.

## What just changed

- 2026-10-06 — **nightly redesigned to stop eating the week's usage.** One `search_issues` call
  finds the work (an empty night ends there); the Opus coordinator stays thin and never reads code;
  at most 3 background workers, one per repo, refilled one at a time; nothing new after 2h; workers
  turn on auto-merge instead of waiting on CI, and the next night merges/fixes leftovers found by
  the PR marker `Built by the nightly backlog run.`. The nightly never asks questions: unclear items
  get questions on the issue + `needs-grilling`, and Isaiah grills with the new `/backlog-next`
  (builds a project's top ready item, else grills its oldest `needs-grilling` one). **Isaiah still
  needs to:** set `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000` on the Routine's environment
  (`backlog/routines/SETUP.md` step 8); attach chess, learn-claude-code-terminal and
  business-assurance-resource-allocation to the nightly Routine; turn on "Allow auto-merge" in
  repos with CI; run "Install Backlog System.command" on the Mac. **Unverified until the first
  run:** background workers re-wake a Routine coordinator; the search reaches every attached repo
  (the nightly audit checks one repo a night); the env var reaches subagents.
- 2026-10-10 — **book club scheduler** at `/static/bookclub/` (unlisted; not in the sitemap). Static
  page + Cloudflare Worker/D1 API (`bookclub-tool/`, README there). Login = name + 4-digit PIN.
  Suite `tests/bookclub` passes locally but is **not yet in the deploy gate**: this session can't
  edit `deploy.yml` (add `bookclub` to `ALL`, `bookclub) extra='' ;;`, drop it from `UNWIRED`).
- Older entries: `docs/archive/HANDOFF-history-to-2026-09.md`.

## Exact next step

1. Morning of 2026-09-23: the nightly should have sent a push with three counts
   (`N/N covered · N opened · 0 audited`). No counts, or "BROKEN…", means it's
   still failing — open the run from the Routine page and read why.
2. Studio v1 has items 1–7 specced in `STUDIO-SCOPE.md`. Mark which are done and
   pick up the first unfinished one — nothing records that status yet.

## Gotchas

- **Never edit `.quartz/plugins/`** — regenerated on every deploy.
- **Local vs live patch parity:** local Preview/Publish scripts `sed`-patch the
  plugins (`tokenize:"full"`; explorer breakpoint `800px`→`99999px`).
  `deploy.yml` must carry the same patches. The explorer patch is load-bearing —
  removing it breaks the home page splash.
- `Dockerfile` is orphaned. `build-preview.yaml` / `deploy-preview.yaml` need a
  closer look before touching.
- Junk: `node_modules 2/3/4` — iCloud-era duplicates, gitignored, safe to delete.

## Publish

```bash
/bin/zsh "./Publish Changes.command"
```

Then watch the run and verify on the live URL.
