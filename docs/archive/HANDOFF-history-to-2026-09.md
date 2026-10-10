# HANDOFF history (moved out of HANDOFF.md on 2026-10-10)

## What just changed (older entries)

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
