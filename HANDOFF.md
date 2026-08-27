# HANDOFF — barkernotbob.github.io (Quartz v5 site)

_Last updated: 2026-08-27_

## Current status

Live and healthy at https://barkernotbob.github.io. Quartz v5, deployed by GitHub
Actions (`.github/workflows/deploy.yml`) → GitHub Pages, ~5–6 min per publish.

**Branch note (changed 2026-08-06):** the production branch used to be `v5`. It is
now **`main`** — renamed, and it is the repo default. Three things had to move with
it, all done and verified by a real deploy:

1. `deploy.yml` and `ci.yaml` triggers (`v5` → `main`)
2. the `github-pages` environment's deployment branch policy (only allowed `v5`,
   which silently rejected the deploy job before it ran a single step)
3. the Pages source branch via the API

If a deploy ever fails with an empty log / `BlobNotFound`, check #2 first — that
failure mode produces a job with no steps and no logs.

## What just changed

- 2026-08-27 — **the nightly backlog has never been able to reach GitHub, and
  still can't.** The Routine fires, clones this repo, reads the protocol, and
  then stops: the session it fires has no `gh` CLI, no GitHub MCP tools, and no
  `add_repo`, so it cannot list a single issue in any repo — including this one.
  It reports this correctly and sends a notification; the run "succeeds" because
  the agent stops cleanly, which is why it looked healthy from the outside.

  **Root cause:** a Routine freezes its tool grants at creation time. This one
  was created 2026-08-08 from a session that held no MCP tools, and its stored
  list is built-ins only — no `mcp__github__*`, no `add_repo`. Neither
  `update_trigger` (no such parameter) nor `create_trigger` (writes the same
  default list regardless of the calling session) can change it.

  **Not the cause, though both were suspected:** repo authorization is fine —
  `add_repo` on `BarkernotBob/bank-bonuses` succeeds from a normal session, so
  the account-level GitHub grants already cover the other repos. And the stale
  `planned` + `nightly-ok` labels in the Routine's prompt were real but never
  reached — the run dies before the queue is built. That prompt is fixed anyway,
  and it now has to report counts on every run, empty nights included.

  **The fix is in the UI, not in this repo:** delete and recreate the Routine
  from https://claude.ai — Settings → Routines — so it is provisioned with the
  tools a normal session gets. The same defect applies to the new
  `Monthly branch sweep` Routine (`trig_018KFdmKDquYi7UWRup93cGT`), created the
  same way; it will fail identically on 1 September until recreated.

  Also new: `.claude/settings.json` pre-approves the GitHub and git operations
  the routine needs and *denies* what it must never do (workflow files,
  `.quartz/plugins/`, force-push, rebase) — rules that were prose-only before.
  That governs prompting, not tool availability, so it does not by itself
  unblock the nightly. And `/branch-sweep`, meant to run monthly, deletes
  branches whose work already landed and files one issue about the rest.
- 2026-08-27 — **the July audit is now a backlog.** All eight findings in
  `AUDIT-GAPS.md` became issues #108–#115 (W8 deliberately excepted). Nothing in
  that document had moved in six weeks, and GAP-W4 had got *worse* — bank-bonus
  went from 78 inline handlers to 86.

- 2026-08-09 — **backlog: labels no longer gate visibility.** The first cut needed
  a `planned` label to appear on the board, and the GitHub phone app can't apply
  labels through issue forms — so phone-filed items silently vanished. Now **any
  open issue is a planned item**; labels only subtract (`in-progress`, `blocked`,
  `hold`, plus the `needs-grilling` flag). `planned` and `nightly-ok` are
  retired and `install.sh` deletes them. New: `/backlog-add` (dictate a list,
  get issues) and `quartz/static/Backlog.html`, an unlinked capture page —
  no token, no repo names, project list in localStorage.
- 2026-08-08 — **backlog system.** Planned changes are now GitHub issues in each
  project's own repo, filed from the phone through two issue forms, tracked by
  five labels, and worked by `/backlog-work` or an overnight Routine that builds
  and merges. `BACKLOG_GUIDE.md` is the user-facing doc, `backlog/README.md` the
  maintainer's. Run `Install Backlog System.command` once to push the forms and
  labels out to every repo in `backlog/repos.txt`.
- 2026-08-08 — **branch cleanup.** 10 abandoned branches dropped after verifying each
  against `main` (most had already landed by another route; one,
  `calendar-dd-events-missing-5z0fi0`, would have *reverted* the bank-bonus redesign).
  Before dropping, the one unique artifact was salvaged: the Obsidian Web Clipper
  template at `Website Setup/YouTube Web Clipper Template.json`. **5 branches survive
  and still need your decision** — see `grocery-tool/BRANCH-REVIEW-abandoned-work.md`
  (3 grocery branches), plus `claude/nifty-darwin-7y442n` (tax modeler) and
  `claude/bank-bonus-pwa-iphone-bm1wwk`, both documented in their own repos.
- 2026-08-06 — branch rename `v5` → `main` + the three fixes above.
- 2026-07-19 — **Studio** landed: edit-in-place layer over the real site with a
  Publish button (undoable change list, working navigation, reachable landing
  pages). Scope and the red-team gate are in `STUDIO-SCOPE.md`.

## Exact next step

Studio v1 has items 1–7 specced in `STUDIO-SCOPE.md`. Open it, mark which of the
seven are actually done vs. still open, and pick up the first unfinished one.
Nothing in the repo currently records that status — that's the gap to close first.

## Gotchas

- **Never edit `.quartz/plugins/`** — gitignored and regenerated by
  `npx quartz plugin install` on every deploy. Edits there vanish live.
- **Local vs live patch parity:** the local Preview/Publish scripts patch plugins
  via `sed` (`tokenize:"full"`; explorer breakpoint `800px`→`99999px`).
  `deploy.yml` must carry the same patches or local ≠ live.
- The explorer "drawer at all widths" patch is **load-bearing** — removing it
  breaks the home page splash.
- `deploy-v5.yaml` and `docker-build-push.yaml` were upstream Quartz files gated to
  `jackyzha0/quartz` — inert here, every run in their history was `skipped`.
  **Deleted 2026-08-08.** They were the reason dependabot kept proposing docker/
  cosign action bumps for tooling this site never used. `Dockerfile` (320 B) is now
  orphaned — nothing builds it; delete it too if you never want a container image.
  `build-preview.yaml` / `deploy-preview.yaml` (the Cloudflare preview pair) were
  left alone deliberately — they are not gated the same way and need a closer look.
- Junk in the working tree: `node_modules 2` (11 MB), `node_modules 3`,
  `node_modules 4` (both empty) — iCloud-era duplicates, gitignored, safe to delete.

## Publish

```bash
/bin/zsh "./Publish Changes.command"
```

Then watch the run and verify on the live URL.
