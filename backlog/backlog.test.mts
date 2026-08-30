import assert from "node:assert"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test, { describe } from "node:test"
import { fileURLToPath } from "node:url"
import { parse } from "yaml"

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(here, "..")

const labels = JSON.parse(fs.readFileSync(path.join(here, "labels.json"), "utf8")) as {
  name: string
  color: string
  description: string
}[]

const labelNames = new Set(labels.map((label) => label.name))

// The two forms Isaiah files from, plus this repo's customised copies. All four
// must stay consistent with labels.json or issues land with labels that don't
// exist and never show up on the board.
const formsIn = (dir: string) =>
  fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".yml"))
    .map((name) => path.join(dir, name))

const formFiles = [
  ...formsIn(path.join(here, "templates")),
  ...formsIn(path.join(repoRoot, ".github/ISSUE_TEMPLATE")),
]

describe("labels.json", () => {
  test("names are unique", () => {
    assert.strictEqual(labelNames.size, labels.length)
  })

  test("colors are bare six-digit hex, as the GitHub API wants them", () => {
    for (const label of labels) {
      assert.match(label.color, /^[0-9A-F]{6}$/i, `${label.name} has color ${label.color}`)
    }
  })

  test("every status the tooling reads is defined", () => {
    for (const status of ["in-progress", "blocked", "needs-grilling", "hold"]) {
      assert.ok(labelNames.has(status), `missing label: ${status}`)
    }
  })

  test("does not define a label that filing would have to remember to set", () => {
    // An unlabelled open issue is a planned item. Reintroducing `planned` or
    // `nightly-ok` would put a required tap back on the filing screen, which is
    // what made items silently vanish before.
    for (const retired of ["planned", "nightly-ok"]) {
      assert.ok(!labelNames.has(retired), `${retired} is retired, drop it again`)
    }
  })
})

describe("issue forms", () => {
  for (const file of formFiles) {
    const form = parse(fs.readFileSync(file, "utf8"))
    const name = path.basename(file)

    test(`${name} parses and has the fields GitHub requires`, () => {
      assert.ok(form.name, "needs a name")
      assert.ok(form.description, "needs a description")
      assert.ok(Array.isArray(form.body) && form.body.length > 0, "needs a body")
    })

    test(`${name} applies only labels that exist`, () => {
      // Labels are optional now — a form with none is the normal case.
      for (const label of form.labels ?? []) {
        assert.ok(labelNames.has(label), `${name} applies unknown label: ${label}`)
      }
    })

    test(`${name} never makes visibility depend on a label`, () => {
      // GitHub silently drops labels it doesn't know, and the phone app skips
      // forms entirely — so nothing may be required to reach the board.
      for (const label of form.labels ?? []) {
        assert.ok(
          ["needs-grilling", "hold"].includes(label),
          `${name} applies ${label}, which the board would have to filter on`,
        )
      }
    })

    test(`${name} dropdown defaults point at a real option`, () => {
      for (const field of form.body) {
        if (field.type !== "dropdown") continue
        const { options, default: index } = field.attributes
        if (index === undefined) continue
        assert.ok(index >= 0 && index < options.length, `${field.id} default out of range`)
      }
    })
  }
})

describe("repos.txt", () => {
  const lines = fs
    .readFileSync(path.join(here, "repos.txt"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))

  test("every entry is owner/repo", () => {
    for (const line of lines) {
      assert.match(line, /^[\w.-]+\/[\w.-]+$/, `bad entry: ${line}`)
    }
  })

  test("no duplicates", () => {
    assert.strictEqual(new Set(lines).size, lines.length)
  })

  test("this repo is covered", () => {
    assert.ok(lines.includes("BarkernotBob/BarkernotBob.github.io"))
  })
})

describe("backlog.py", () => {
  const daysAgo = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z")

  const issue = (
    number: number,
    title: string,
    labelNames: string[],
    extra: Record<string, unknown> = {},
  ) => ({
    number,
    title,
    url: `https://github.com/BarkernotBob/demo/issues/${number}`,
    labels: labelNames.map((name) => ({ name })),
    createdAt: daysAgo(10),
    updatedAt: daysAgo(2),
    closedAt: null,
    comments: 0,
    ...extra,
  })

  const openIssues = [
    // The case that matters most: filed from the phone, no labels at all.
    issue(1, "Bare issue from the phone", []),
    issue(2, "Being worked", ["in-progress"]),
    issue(3, "Stuck", ["blocked"]),
    // Carries two statuses; blocked outranks in-progress, so it appears once.
    issue(4, "Stuck mid-build", ["in-progress", "blocked"]),
    issue(5, "Parked on purpose", ["hold"]),
    issue(6, "Rough idea", ["needs-grilling"]),
    issue(10, "Labelled with something unrelated", ["documentation"]),
  ]

  const closedIssues = [
    issue(7, "Shipped recently", [], { closedAt: daysAgo(5) }),
    issue(8, "Shipped ages ago", [], { closedAt: daysAgo(100) }),
  ]

  // A stand-in for the real `gh`, so the test never touches the network.
  const withStubbedGh = (run: (workdir: string) => string) => {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "backlog-test-"))
    try {
      const bin = path.join(workdir, "bin")
      fs.mkdirSync(bin)
      fs.writeFileSync(path.join(workdir, "open.json"), JSON.stringify(openIssues))
      fs.writeFileSync(path.join(workdir, "closed.json"), JSON.stringify(closedIssues))
      fs.writeFileSync(
        path.join(bin, "gh"),
        `#!/bin/sh\ncase "$*" in\n  *"--state closed"*) cat "${workdir}/closed.json" ;;\n  *) cat "${workdir}/open.json" ;;\nesac\n`,
        { mode: 0o755 },
      )
      fs.writeFileSync(path.join(workdir, "repos.txt"), "BarkernotBob/demo\n")
      return run(workdir)
    } finally {
      fs.rmSync(workdir, { recursive: true, force: true })
    }
  }

  const output = withStubbedGh((workdir) => {
    const out = path.join(workdir, "BACKLOG.md")
    execFileSync(
      "python3",
      [
        path.join(here, "backlog.py"),
        "--repos-file",
        path.join(workdir, "repos.txt"),
        "--output",
        out,
      ],
      { env: { ...process.env, PATH: `${path.join(workdir, "bin")}:${process.env.PATH}` } },
    )
    return fs.readFileSync(out, "utf8")
  })

  test("counts each status once, with blocked outranking in-progress", () => {
    // planned 3 (#1, #6, #10) | in-progress 1 | blocked 2 | hold 1 | done 1
    assert.match(output, /\| \[demo\]\(\S+\) \| 3 \| 1 \| 2 \| 1 \| 1 \|/)
  })

  test("an unlabelled open issue lands on the board as Planned", () => {
    const planned = output.slice(output.indexOf("### Planned"))
    assert.match(planned, /Bare issue from the phone/)
  })

  test("an issue labelled with something unrelated still counts as Planned", () => {
    const planned = output.slice(output.indexOf("### Planned"))
    assert.match(planned, /Labelled with something unrelated/)
  })

  test("parked items are held out of Planned", () => {
    const planned = output.slice(output.indexOf("### Planned"), output.indexOf("### On hold"))
    assert.ok(!planned.includes("Parked on purpose"), planned)
    assert.match(output, /### On hold \(1\)/)
  })

  test("drops closed items older than the reporting window", () => {
    assert.ok(output.includes("Shipped recently"))
    assert.ok(!output.includes("Shipped ages ago"))
  })

  test("flags items the nightly routine must not build", () => {
    const roughIdea = output.split("\n").find((line) => line.includes("Rough idea"))
    const context = output.slice(output.indexOf(roughIdea!))
    assert.match(context, /needs a conversation first/)
  })

  test("links every item back to its issue", () => {
    assert.match(output, /\[#1\]\(https:\/\/github\.com\/BarkernotBob\/demo\/issues\/1\)/)
  })
})

describe("backlog.py survives a repo it can't read", () => {
  // One unreachable repo used to take the whole report down, leaving no
  // BACKLOG.md at all rather than a report with one gap in it.
  const run = (ghScript: string) => {
    const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "backlog-test-"))
    try {
      const bin = path.join(workdir, "bin")
      fs.mkdirSync(bin)
      fs.writeFileSync(path.join(bin, "gh"), ghScript, { mode: 0o755 })
      fs.writeFileSync(path.join(workdir, "repos.txt"), "BarkernotBob/broken\n")
      const out = path.join(workdir, "BACKLOG.md")
      execFileSync(
        "python3",
        [
          path.join(here, "backlog.py"),
          "--repos-file",
          path.join(workdir, "repos.txt"),
          "--output",
          out,
        ],
        { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, stdio: "pipe" },
      )
      return fs.readFileSync(out, "utf8")
    } finally {
      fs.rmSync(workdir, { recursive: true, force: true })
    }
  }

  test("reports a gh error instead of crashing", () => {
    const output = run('#!/bin/sh\necho "could not resolve to a Repository" >&2\nexit 1\n')
    assert.match(output, /Couldn't read these/)
    assert.match(output, /broken/)
  })

  test("reports non-JSON output instead of crashing", () => {
    const output = run('#!/bin/sh\necho "A new release of gh is available"\n')
    assert.match(output, /Couldn't read these/)
    assert.match(output, /wasn't JSON/)
  })

  test("does not also file an unreadable repo under Nothing filed yet", () => {
    const output = run("#!/bin/sh\nexit 1\n")
    assert.ok(!output.includes("Nothing filed yet"), output)
  })
})

// The nightly run's coverage rules live in prose, because the thing that
// executes them is a language model rather than a function. That makes them
// exactly as easy to delete by accident as any other paragraph — and the
// failure they prevent is silent by construction, so nothing else would notice.
describe("nightly run reports repo coverage", () => {
  const nightlyCommand = fs.readFileSync(
    path.join(repoRoot, ".claude/commands/backlog-nightly.md"),
    "utf8",
  )
  const workerBriefing = fs.readFileSync(path.join(here, "routines/nightly-backlog.md"), "utf8")
  const readme = fs.readFileSync(path.join(here, "README.md"), "utf8")

  // Reused, not re-filed, so a bad week doesn't produce seven identical issues.
  // Both files have to name it identically or the run files a duplicate.
  const coverageIssueTitle = "Nightly pass could not reach every repo"

  test("the command file keeps all four ledger outcomes distinct", () => {
    // `assumed` is what the search-first scan added: a repo the search spoke
    // for but nobody opened. Collapsing it into `empty` is how a scan that
    // cannot see a repo starts reporting that repo as clean.
    for (const outcome of ["read", "empty", "assumed", "unreachable"]) {
      assert.match(
        nightlyCommand,
        new RegExp(`\\*\\*${outcome}\\*\\*`),
        `the coverage ledger no longer names "${outcome}"`,
      )
    }
  })

  test("the command file forbids collapsing empty into unreachable", () => {
    // The whole bug: "nothing to do" and "I never looked" read identically in a
    // summary that only counts issues found.
    assert.match(nightlyCommand, /[Nn]ever collapse/)
    assert.match(nightlyCommand, /blind spot/)
  })

  test("a refused add_repo is retried once", () => {
    // Retries demonstrably succeed, so not retrying throws away coverage for
    // free. Both files carry this one; it is the step most likely to be skipped
    // under time pressure.
    for (const [name, text] of [
      ["command file", nightlyCommand],
      ["worker briefing", workerBriefing],
    ] as const) {
      assert.match(text, /retry .{0,40}refusal once|[Rr]etry a refusal once/, `${name} dropped it`)
    }
  })

  test("add_repo calls are serialized rather than batched", () => {
    // Anchored on "repo" so this can't be satisfied by the unrelated "One item
    // at a time" rule in step 2, which is about issues, not repositories.
    assert.match(nightlyCommand, /one repo at a time/i)
  })

  test("the notification carries coverage as a fraction", () => {
    // Counts only — names would leak private repos into a push notification.
    assert.match(nightlyCommand, /\d+\/\d+ covered/)
    assert.match(nightlyCommand, /[Dd]o not put private repo names/)

    // The fraction must never travel alone. Under search-first, `covered` is
    // ~100% every night including nights nobody opened most of those repos, so
    // on its own it means little more than "the run finished". `opened` and
    // `audited` are the numbers that would look wrong if the scan broke.
    assert.match(nightlyCommand, /\*\*opened\*\*/)
    assert.match(nightlyCommand, /\*\*audited\*\*/)
    assert.match(nightlyCommand, /fraction alone is forbidden/i)
  })

  test("unreachable repos are named on a reused, held issue", () => {
    assert.ok(
      nightlyCommand.includes(coverageIssueTitle),
      "the command file no longer names the coverage issue",
    )
    // `hold` keeps it off the board's queue: a later pass must not try to fix a
    // classifier it doesn't control.
    assert.match(nightlyCommand, /label it \*\*`hold`\*\*/)
    assert.ok(labelNames.has("hold"), "the coverage issue's label must exist")
  })

  test("the worker briefing routes names and counts to the right channels", () => {
    // Names on the coverage issue, counts in the notification. The briefing
    // used to say "by name" without saying where, which reads as license to put
    // private repo names in a push notification.
    assert.match(workerBriefing, /notification carries counts only/i)
    assert.match(workerBriefing, /names of repos you were refused go on the coverage issue/i)
  })

  test("the scan searches before attaching, and attaches only what has work", () => {
    // Eighteen add_repo calls to find work in one repo was eighteen chances for
    // the classifier to refuse. One search replaces them.
    // Deliberately not pinned to a repo count: repos.txt grows, and a guard
    // that hardcodes 18 would pass while silently dropping the 19th.
    assert.match(nightlyCommand, /[Dd]o not attach every repo/)
    assert.match(nightlyCommand, /attach only the repos that actually have issues/i)
    // repos.txt permits any owner; a repo no search covered must still be read.
    assert.match(nightlyCommand, /not covered by an owner you searched/)
    for (const [name, text] of [
      ["command file", nightlyCommand],
      ["worker briefing", workerBriefing],
    ] as const) {
      assert.match(text, /is:open is:issue user:BarkernotBob/, `${name} lost the search`)
    }
  })

  test("the run audits repos the search called empty", () => {
    // The search has never been observed reaching an UNATTACHED repo, because
    // no issue has existed in one to test it with. Without this audit that
    // stays unknown forever, and a scoped search would hide work silently.
    assert.match(nightlyCommand, /[Aa]udit two repos the search called empty/)
    assert.match(nightlyCommand, /fall back to attaching every repo/)
    // Rotation must walk repos.txt itself, not "whichever repos the search
    // called empty tonight" — that set differs nightly, so some repos would be
    // audited repeatedly and others effectively never.
    assert.match(nightlyCommand, /day-of-year/)
    assert.match(nightlyCommand, /sorted, as a fixed list/)
  })

  test("readiness is defined, and thin or big alone never sends an item to grilling", () => {
    // Without this, "err toward grilling" degrades into grilling everything and
    // shipping nothing — the opposite failure to building the wrong thing.
    assert.match(nightlyCommand, /Ready to build/)
    assert.match(nightlyCommand, /NOT reasons to grill/)
    for (const notAReason of ["Thin", "Big", "Unfamiliar code"]) {
      assert.match(
        nightlyCommand,
        new RegExp(`\\*\\*${notAReason}`),
        `"${notAReason}" is no longer listed as a non-reason to grill`,
      )
    }
    // One answerable question, not a list and not a restatement.
    // \s+ rather than a literal space: Prettier reflows this prose, and a guard
    // that breaks on a line wrap gets deleted rather than fixed.
    assert.match(nightlyCommand, /single\s+specific\s+question/)
  })

  test("the run is forbidden from inventing work", () => {
    assert.match(nightlyCommand, /Never invent work/)
    assert.match(nightlyCommand, /[Dd]o not file new work items/)
    // An empty queue is a result, not a prompt to go looking for something.
    assert.match(nightlyCommand, /empty\s+night\s+is\s+a\s+correct/)
    assert.match(workerBriefing, /Never invent work/)
  })

  test("README documents the search-first scan and the readiness bar", () => {
    assert.match(readme, /stop attaching repos that have no work/i)
    assert.match(readme, /## What the nightly run may build/)
    assert.match(readme, /thin is not ambiguous and big is not ambiguous/i)
  })

  test("README documents the limitation and the ruled-out workaround", () => {
    assert.match(readme, /## Repo coverage/)
    assert.ok(
      readme.includes(coverageIssueTitle),
      "README must name the same coverage issue the run files, or the run files a duplicate",
    )
    // Seeding every repo at launch was the obvious-sounding fix. It is ruled
    // out, and re-deriving that costs a whole run to discover.
    assert.match(readme, /singular/)
  })
})
