# HANDOFF — barkernotbob.github.io (Quartz v5 site)

_Last updated: 2026-09-22_

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

- 2026-09-23 — **games publish from `~/Projects` again.** The copy step looked in the old Obsidian
  folder (gone), so the live games sat on July builds. `GAMES` in both scripts lists the apps by
  path (Hexchain held: blockchain#47) and prints a note if one is missing. `~/Website Launchers` point here too.
- 2026-09-22 — **nightly reminds you to add access.** Any repo it can't reach (in `repos.txt` but not attached, or a new project it finds) gets an "Add access" line in the push, naming the repo and linking the Routine page. New projects are added to `repos.txt` at creation (global CLAUDE.md).
- 2026-09-22 — **the nightly backlog can finally see GitHub.** Since 2026-08-27
  it was a Claude-made Routine resuming one long-lived chat. Claude-made Routines
  get no GitHub tools, and attaching a repo afterwards doesn't add any to that
  chat — so every night it woke, could list nothing, and stopped. Fixed by
  remaking both Routines from the web page: each run starts a fresh chat that can
  read and write every attached repo. That chat has **no `add_repo`**, and the
  briefings treated that as "broken" — the first working run stopped itself on
  it. The briefings and `/backlog-nightly` now say a Routine just reads its
  attached repos; a test in `backlog/backlog.test.mts` holds that.
- 2026-09-01 — **GAP-W2b (#110): all four app suites gate the deploy.**
  `changes` in `deploy.yml` emits the touched apps as a JSON matrix; the
  `gate_test` job tests that filter on every push.
- 2026-08-27 — July audit → issues #108–#115. `/branch-sweep` added. `.claude/settings.json`
  denies workflow files, `.quartz/plugins/`, force-push and rebase.
- 2026-08-08 — backlog system (`BACKLOG_GUIDE.md`, `backlog/README.md`). Branch
  cleanup: 5 branches still need a decision — see
  `grocery-tool/BRANCH-REVIEW-abandoned-work.md`.
- 2026-07-19 — **Studio** landed (edit-in-place + Publish). See `STUDIO-SCOPE.md`.

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
