# ⚠️ FOR REVIEW — abandoned Grocery work on branches of this repo

**Status: UNREVIEWED. Not merged, not deleted. Decide before doing new Grocery work.**

Three branches in this repo carry Grocery work that never reached `main`. All are
on GitHub, so nothing is at risk while this sits — but none of it is live.

---

## 1. `claude/vigilant-bell-szzhxa` — sign-in, 2 commits, 2026-06-27

**Likely the most valuable of the three. Possibly new — check first.**

| File | Lines |
|---|---|
| `grocery-tool/signin/worker.js` | 58 (new) |
| `grocery-tool/signin/SIGN-IN-SETUP.md` | 114 (new) |
| `grocery-tool/PROJECT-STATUS.md` | 138 (new) |
| `quartz/static/grocery/index.html` | +86 |

One-tap **"Sign in with GitHub" via OAuth device flow**, plus the Cloudflare worker
that backs it and its setup doc. `main` has no `grocery-tool/signin/` directory at
all, so this does not exist on the live site in any form.

Also adds `PROJECT-STATUS.md` (status, next steps, roadmap) — `main` has no
equivalent, so this may be the only written record of where Grocery actually stood.

Browse: https://github.com/BarkernotBob/BarkernotBob.github.io/tree/claude/vigilant-bell-szzhxa/grocery-tool

---

## 2. `claude/project-requirements-build-0p8d6m` — S4 TODAY screen, 1 commit, 2026-07-05

**Substantial and test-backed. Possibly new — check second.**

| File | Change |
|---|---|
| `quartz/static/grocery/index.html` | +258 |
| `quartz/static/grocery/app.css` | +124 (new) |
| `tests/grocery/today.spec.js` | +151 (new) |
| `tests/grocery/render.spec.js`, `data-layer.spec.js`, `screenshots.spec.js`, `support/boot.js`, `support/mock-github.js` | updated |

The designed **TODAY screen + sync strip + provenance**, implementing the S4 design
stage — and unlike most abandoned work here it **ships with its own spec tests**.
That makes it much cheaper to evaluate: check out the branch and run the grocery
specs.

Browse: https://github.com/BarkernotBob/BarkernotBob.github.io/tree/claude/project-requirements-build-0p8d6m

---

## 3. `claude/grocery-tracker-redesign-cqtwls` — S3 mockups, 1 commit, 2026-07-05

**CONFIRMED DUPLICATIVE — safe to delete, no review needed.**

All four files it adds are **byte-identical to what `main` already has** (verified
by blob hash 2026-08-06):

- `grocery-tool/design/README.md`
- `grocery-tool/design/style-tile.png`
- `grocery-tool/design/today-mockup.html`
- `grocery-tool/design/today-light-dark.png`

The S3 design sign-off mockups reached `main` by another route. This branch holds
nothing unique.

---

## Suggested order

1. Delete #3 — confirmed redundant.
2. Evaluate #2 — it has tests, so it self-verifies fastest.
3. Evaluate #1 — the OAuth sign-in is genuinely absent from `main`; decide whether
   Grocery still needs sign-in before rebuilding the worker.
4. Whatever survives: re-implement through the normal pipeline rather than merging
   a five-week-old branch onto a moved `main`.

_Filed 2026-08-06 during a branch audit. Note this repo's production branch was
renamed `v5` → `main` on 2026-08-06; these branches were cut when it was `v5`, so
expect merge conflicts if you try to merge rather than re-implement._
