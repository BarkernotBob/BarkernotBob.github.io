/**
 * Deploy-gate regression suite.  Run: npx tsx --test tests/workflow/deploy-gate.test.mts
 *
 * GAP-W2b (#110) wired the four app suites into the deploy. The failure mode
 * this guards is silent in both directions:
 *
 *   - a suite that is never selected doesn't go red, it goes SKIPPED, and a
 *     skipped job counts as a pass on the way to `deploy`;
 *   - a path that drops out of the change filter doesn't announce itself
 *     either — the app just quietly deploys with nothing run against it.
 *
 * Both already happened once. `quartz/static/shared/` landed with GAP-W5 (#111)
 * after the grocery filter was written, so for four days every app could be
 * changed through its shared modules and deploy untested.
 *
 * So these tests do not check that the workflow *mentions* the right paths.
 * They execute the filter script with stubbed git output and assert which
 * suites it actually selects.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..")
const WORKFLOW = path.join(ROOT, ".github/workflows/deploy.yml")
const source = fs.readFileSync(WORKFLOW, "utf8")
const workflow = parse(source)

/**
 * Suites that exist but are deliberately outside the deploy gate. Being on
 * this list is a decision with a reason attached; being off it and unwired is
 * the bug. A new suite fails the coverage test until someone picks one.
 */
const UNWIRED = new Map([
  ["install-checks", "PWA install checks — not one of the four apps #110 covers"],
])

/** Every directory under tests/ that is a Playwright suite. */
function suiteDirs(): string[] {
  return fs
    .readdirSync(path.join(ROOT, "tests"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(ROOT, "tests", name, "playwright.config.js")))
    .sort()
}

/** The `run:` script of the change-detection step. */
function filterScript(): string {
  const step = workflow.jobs.changes.steps.find((s: any) => s.id === "filter")
  assert.ok(step, "the change-detection step lost its `filter` id")
  return step.run
}

/** The app list the filter iterates over. */
function gateApps(): string[] {
  const m = filterScript().match(/^\s*ALL='([^']*)'/m)
  assert.ok(m, "the filter's ALL list is gone — nothing drives the matrix")
  return m[1].split(/\s+/).filter(Boolean)
}

/** Does this suite use the shared GitHub API mock? */
function usesSharedMock(app: string): boolean {
  const dir = path.join(ROOT, "tests", app)
  const walk = (d: string): string[] =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      if (e.name === "node_modules" || e.name.startsWith(".")) return []
      const full = path.join(d, e.name)
      return e.isDirectory() ? walk(full) : [full]
    })
  return walk(dir).some(
    (f) => /\.(js|mjs|cjs)$/.test(f) && fs.readFileSync(f, "utf8").includes("shared/mock-github"),
  )
}

/**
 * Run the real filter script against a pretend commit.
 *
 * The two `${{ }}` expressions are substituted the way Actions would, and a
 * stub `git` on PATH returns `changed` from `diff --name-only`. Everything
 * else — the ALL list, the force-all grep, the per-app loop, the JSON
 * emitter — is the workflow's own code, unmodified.
 */
function selectedFor(changed: string[], opts: { event?: string; base?: string } = {}): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-gate-"))
  try {
    const bin = path.join(dir, "bin")
    fs.mkdirSync(bin)
    fs.writeFileSync(
      path.join(bin, "git"),
      `#!/bin/sh
case "$1 $2" in
  "cat-file -e") exit 0 ;;
  "diff --name-only") cat "${path.join(dir, "changed.txt")}" ;;
  *) exit 1 ;;
esac
`,
      { mode: 0o755 },
    )
    fs.writeFileSync(path.join(dir, "changed.txt"), changed.join("\n") + "\n")

    const outFile = path.join(dir, "output")
    fs.writeFileSync(outFile, "")

    const script = filterScript()
      .replaceAll("${{ github.event_name }}", opts.event ?? "push")
      .replaceAll("${{ github.event.before }}", opts.base ?? "a".repeat(40))

    execFileSync("sh", ["-c", script], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: outFile },
      encoding: "utf8",
    })

    const line = fs
      .readFileSync(outFile, "utf8")
      .split("\n")
      .filter((l) => l.startsWith("apps="))
      .pop()
    assert.ok(line, "the filter emitted no `apps=` output")
    return JSON.parse(line.slice("apps=".length))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Coverage: no suite may exist outside the gate by accident
// ---------------------------------------------------------------------------

test("every Playwright suite is wired into the deploy gate, or explicitly excused", () => {
  const apps = gateApps()
  for (const dir of suiteDirs()) {
    if (UNWIRED.has(dir)) continue
    assert.ok(
      apps.includes(dir),
      `tests/${dir}/ is a Playwright suite that deploy.yml never selects. ` +
        `It would not fail the deploy — it would be skipped, and a skipped job counts as a pass. ` +
        `Add it to ALL in the filter, or to UNWIRED in this test with a reason.`,
    )
  }
})

test("every app in the gate has a suite and an app directory to test", () => {
  for (const app of gateApps()) {
    assert.ok(
      fs.existsSync(path.join(ROOT, "tests", app, "playwright.config.js")),
      `deploy.yml selects "${app}" but tests/${app}/ has no Playwright suite`,
    )
    assert.ok(
      fs.existsSync(path.join(ROOT, "quartz/static", app)),
      `deploy.yml selects "${app}" but quartz/static/${app}/ does not exist`,
    )
  }
})

// ---------------------------------------------------------------------------
// Behaviour: what the filter actually selects
// ---------------------------------------------------------------------------

test("an ordinary content publish runs no suite at all", () => {
  assert.deepEqual(selectedFor(["content/notes/some-note.md"]), [])
})

test("touching one app runs that app's suite and no other", () => {
  for (const app of gateApps()) {
    assert.deepEqual(selectedFor([`quartz/static/${app}/index.html`]), [app])
    assert.deepEqual(selectedFor([`tests/${app}/flows.spec.js`]), [app])
  }
})

test("touching the shared browser modules runs every suite", () => {
  // quartz/static/shared/ arrived with GAP-W5 (#111). All four apps import
  // from it at runtime, so an edit there can break any of them. This is the
  // gap that existed unnoticed between #111 landing and #110.
  assert.deepEqual(selectedFor(["quartz/static/shared/dom.js"]), gateApps())
  assert.deepEqual(selectedFor(["quartz/static/shared/text.js"]), gateApps())
})

test("editing the shared GitHub mock runs every suite that uses it", () => {
  const selected = selectedFor(["tests/shared/mock-github.js"])
  for (const app of gateApps()) {
    if (usesSharedMock(app)) {
      assert.ok(
        selected.includes(app),
        `tests/${app}/ uses the shared mock but a change to it would skip that suite — ` +
          `and a skipped suite passes`,
      )
    }
  }
})

test("this workflow and the Quartz config run every suite", () => {
  assert.deepEqual(selectedFor([".github/workflows/deploy.yml"]), gateApps())
  assert.deepEqual(selectedFor(["quartz.config.default.yaml"]), gateApps())
})

test("a manual run tests everything", () => {
  assert.deepEqual(
    selectedFor(["content/notes/some-note.md"], { event: "workflow_dispatch" }),
    gateApps(),
  )
})

test("an unusable base commit fails CLOSED and tests everything", () => {
  // Force-push, rebase or a brand-new branch: the diff can't be scoped, so the
  // safe answer is to run the lot rather than assume nothing changed.
  const zeroes = "0".repeat(40)
  assert.deepEqual(selectedFor(["content/notes/some-note.md"], { base: zeroes }), gateApps())
  assert.deepEqual(selectedFor(["content/notes/some-note.md"], { base: "" }), gateApps())
})

test("two apps touched in one commit run exactly those two", () => {
  const [a, b] = gateApps()
  assert.deepEqual(
    selectedFor([`quartz/static/${a}/index.html`, `tests/${b}/boot.spec.js`]).sort(),
    [a, b].sort(),
  )
})

// ---------------------------------------------------------------------------
// Wiring: the matrix and the gate itself
// ---------------------------------------------------------------------------

test("the test matrix is driven by the filter, and skips when nothing is selected", () => {
  const job = workflow.jobs.test
  assert.equal(job.strategy.matrix.app, "${{ fromJSON(needs.changes.outputs.apps) }}")
  assert.match(String(job.if), /needs\.changes\.outputs\.apps != '\[\]'/)
  assert.equal(job.strategy["fail-fast"], false, "one red app must not hide another's result")
})

test("each suite runs in its own directory with its own browser build", () => {
  const job = workflow.jobs.test
  assert.equal(job.defaults.run["working-directory"], "tests/${{ matrix.app }}")
  const runs = job.steps.filter((s: any) => typeof s.run === "string").map((s: any) => s.run)
  // Per-suite, not once globally: the suites pin different Playwright versions
  // (1.55 vs 1.62 today) and a single install leaves three of them with no browser.
  assert.ok(runs.some((r: string) => r.includes("playwright install")))
  assert.ok(runs.some((r: string) => r.trim() === "npm ci"))
})

test("deploy is blocked by a red suite and by broken change-detection", () => {
  const job = workflow.jobs.deploy
  assert.deepEqual(job.needs, ["build", "changes", "test", "studio_test", "gate_test"])

  const cond = String(job.if)
  // A skipped `test` (nothing selected) must pass; a failed one must not.
  assert.match(cond, /needs\.test\.result != 'failure'/)
  // If change-detection itself errors, `test` is skipped — the deploy must
  // block rather than ship untested.
  assert.match(cond, /needs\.changes\.result == 'success'/)
  assert.match(cond, /needs\.build\.result == 'success'/)
  assert.match(cond, /needs\.studio_test\.result == 'success'/)
  // This suite gates the gate: if it goes red the filter can no longer be
  // trusted to select the right suites, so nothing ships.
  assert.match(cond, /needs\.gate_test\.result == 'success'/)
})

test("this suite runs on every push, so a filter that stops covering an app is caught", () => {
  // Guards against the suite existing but never running — which is how the
  // gap it checks for got in unnoticed in the first place.
  const job = workflow.jobs.gate_test
  assert.ok(job, "the gate_test job is gone — this suite would never run in CI")
  assert.equal(job.if, undefined, "gate_test must not be conditional")
  const runs = job.steps.filter((s: any) => typeof s.run === "string").map((s: any) => s.run)
  assert.ok(
    runs.some((r: string) => r.includes("tests/workflow/deploy-gate.test.mts")),
    "the gate_test job no longer runs this file",
  )
})

test("the filter script is valid POSIX shell", () => {
  const script = filterScript()
    .replaceAll("${{ github.event_name }}", "push")
    .replaceAll("${{ github.event.before }}", "a".repeat(40))
  execFileSync("sh", ["-n"], { input: script })
})
