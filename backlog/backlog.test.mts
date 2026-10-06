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

  test("defines urgent, the one label that reorders", () => {
    assert.ok(labelNames.has("urgent"), "missing label: urgent")
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
    // Filed last, but `urgent` must still put it at the top of Planned.
    issue(11, "Do this first", ["urgent"]),
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
    // planned 4 (#1, #6, #10, #11) | in-progress 1 | blocked 2 | hold 1 | done 1
    assert.match(output, /\| \[demo\]\(\S+\) \| 4 \| 1 \| 2 \| 1 \| 1 \|/)
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

  test("urgent stays Planned but is listed first and marked", () => {
    const planned = output.slice(output.indexOf("### Planned"))
    const firstItem = planned.split("\n").find((line) => line.startsWith("- ["))
    assert.match(firstItem!, /Do this first/)
    const context = output.slice(output.indexOf(firstItem!))
    assert.match(context.split("\n")[1], /URGENT/)
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
describe("nightly ranking honours urgent", () => {
  const nightly = fs.readFileSync(
    path.join(repoRoot, ".claude/commands/backlog-nightly.md"),
    "utf8",
  )
  const ranking = nightly.slice(nightly.indexOf("### Rank by impact"))

  test("urgent ranks right after resuming in-progress work", () => {
    assert.match(ranking, /1\. \*\*Resume\*\*[\s\S]*?2\. \*\*Urgent\*\* — labelled `urgent`/)
  })

  test("filing proposes urgent rather than asking or applying it unasked", () => {
    const add = fs.readFileSync(path.join(repoRoot, ".claude/commands/backlog-add.md"), "utf8")
    assert.match(add, /Suggest urgent:/)
    assert.match(add, /don't apply it yourself/)
  })
})

// Isaiah, 2026-10-06: the nightly used most of a week's usage in single
// nights. These limits are what keep it cheap, and each is one paragraph that
// could be deleted without anything else noticing.
describe("nightly run stays within its limits", () => {
  const nightlyCommand = fs.readFileSync(
    path.join(repoRoot, ".claude/commands/backlog-nightly.md"),
    "utf8",
  )
  const workerBriefing = fs.readFileSync(path.join(here, "routines/nightly-backlog.md"), "utf8")
  const setup = fs.readFileSync(path.join(here, "routines/SETUP.md"), "utf8")

  test("at most three workers, one per repo, refilled one at a time", () => {
    assert.match(nightlyCommand, /At most three workers at once, and at most one per repo/)
    assert.match(nightlyCommand, /Rolling, not batches/)
    assert.match(nightlyCommand, /One item at a time, never a fresh batch/)
    assert.match(workerBriefing, /At most three workers at once, one per repo/)
  })

  test("nothing new starts after two hours", () => {
    assert.match(nightlyCommand, /No new item after 2 hours/)
    assert.match(workerBriefing, /Nothing new after two hours/)
  })

  test("the coordinator stays thin", () => {
    assert.match(nightlyCommand, /thin coordinator/)
    assert.match(nightlyCommand, /never\s+read\s+ahead/)
  })

  test("no worker waits on CI; the next run picks up its PR", () => {
    assert.match(nightlyCommand, /No worker waits on CI/)
    assert.match(nightlyCommand, /enable auto-merge, squash/)
    // Step 1 finds leftover PRs by this marker. A worker that drops it leaves
    // a PR nobody ever merges, so check each side on its own.
    const marker = "Built by the nightly backlog run"
    const section = (from: string, to: string) =>
      nightlyCommand.slice(nightlyCommand.indexOf(from), nightlyCommand.indexOf(to))
    const stepOne = section("## 1. Finish last night's PRs first", "## 2.")
    const workerRules = section("## 4. Rules for every worker", "## 5.")
    assert.ok(stepOne.includes(marker), "step 1 no longer searches for the marker")
    assert.ok(workerRules.includes(marker), "workers no longer add the marker")
    // A PR whose worker gave up must not become a Fix item every night.
    assert.match(stepOne, /`blocked`, `hold` or `needs-grilling`\*\* → leave it/)
  })

  test("never merges on red", () => {
    assert.match(nightlyCommand, /Never merge on red/)
  })

  test("the context cap is configured where the Routine runs", () => {
    assert.match(nightlyCommand, /CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000/)
    assert.match(setup, /CLAUDE_CODE_AUTO_COMPACT_WINDOW/)
  })
})

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

  test("a blind spot is never reported as a quiet night", () => {
    // The whole bug: "nothing to do" and "I never looked" read identically in a
    // summary that only counts issues found.
    assert.match(nightlyCommand, /Never report a blind spot as a quiet night/)
    assert.match(nightlyCommand, /\*\*unknown\*\* contents/)
  })

  test("a failed probe stops the run loudly", () => {
    assert.match(nightlyCommand, /Never continue past a failed probe/)
    for (const text of [nightlyCommand, workerBriefing]) {
      assert.match(text, /BROKEN: nightly backlog did not run/)
    }
  })

  test("the notification carries counts and the needs-you link, not names", () => {
    // Names would leak private repos into a push notification.
    assert.match(nightlyCommand, /[Dd]o not put private repo names/)
    assert.match(
      nightlyCommand,
      /https:\/\/github\.com\/search\?q=user%3ABarkernotBob\+is%3Aissue\+is%3Aopen\+label%3Aneeds-grilling%2Cblocked/,
    )
    assert.match(nightlyCommand, /Nothing ready to build · audit ok/)
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

  test("a repo the Routine can't reach gets an Add access reminder with a link", () => {
    // A new project stays invisible to the nightly until Isaiah attaches it to
    // the Routine, so the notification has to name it and link the page.
    assert.match(
      nightlyCommand,
      /Add access: BarkernotBob\/<repo> → https:\/\/claude\.ai\/code\/routines\/trig_/,
    )
    assert.match(workerBriefing, /\*\*Add access\*\* line/)
  })

  test("the worker briefing routes names and counts to the right channels", () => {
    assert.match(workerBriefing, /notification carries counts only/i)
    assert.match(workerBriefing, /names of repos you were refused go on the coverage issue/i)
  })

  test("one search finds the work, with grilling items left out", () => {
    const query =
      "is:open is:issue user:BarkernotBob -label:blocked -label:hold -label:needs-grilling"
    for (const [name, text] of [
      ["command file", nightlyCommand],
      ["worker briefing", workerBriefing],
      ["README", readme],
    ] as const) {
      assert.ok(text.includes(query), `${name} lost the search`)
    }
    assert.match(nightlyCommand, /no bodies/)
  })

  test("the run audits one repo against the search", () => {
    // The search has never been proven to reach every attached repo. Without
    // the audit that stays unknown forever, and a blind search hides work.
    assert.match(nightlyCommand, /### Audit one repo, every night/)
    // Rotation must walk repos.txt itself, or some repos are audited
    // repeatedly and others never.
    assert.match(nightlyCommand, /day-of-year mod N/)
    assert.match(nightlyCommand, /sorted, as a fixed list/)
    assert.match(nightlyCommand, /the search is unreliable/)
    // The search excludes these labels; an unfiltered listing always differs.
    assert.match(nightlyCommand, /drop the ones labelled `blocked`, `hold` or `needs-grilling`/)
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
    // \s+ rather than a literal space: Prettier reflows this prose, and a guard
    // that breaks on a line wrap gets deleted rather than fixed.
    assert.match(nightlyCommand, /specific\s+questions\s+that\s+blocked\s+you/)
    assert.match(nightlyCommand, /[Nn]ot\s+a\s+restatement/)
  })

  test("the run is forbidden from inventing work", () => {
    assert.match(nightlyCommand, /Never invent work/)
    assert.match(nightlyCommand, /[Dd]o not file new work items/)
    // An empty queue is a result, not a prompt to go looking for something.
    assert.match(nightlyCommand, /empty\s+night\s+is\s+a\s+correct/)
    assert.match(workerBriefing, /Never invent work/)
  })

  test("a Routine session with no add_repo is not treated as broken", () => {
    // A Routine session never has add_repo — it reaches exactly the repos
    // attached to the Routine. Both briefings listed a missing add_repo as a
    // reason to stop, so on 2026-09-22 the first run that could actually read
    // GitHub stopped itself and reported the backlog unreachable.
    const sweepBriefing = fs.readFileSync(
      path.join(here, "routines/monthly-branch-sweep.md"),
      "utf8",
    )
    for (const [name, text] of [
      ["worker briefing", workerBriefing],
      ["sweep briefing", sweepBriefing],
    ] as const) {
      assert.doesNotMatch(text, /no `add_repo`, or/, `${name} stops over a missing add_repo`)
      assert.match(text, /no `add_repo` tool is \*\*not\*\* a reason to stop/i, `${name}`)
    }
  })

  test("README documents the search, the audit and the readiness bar", () => {
    assert.match(readme, /### One search, one audit/)
    assert.match(readme, /## What the nightly run may build/)
    assert.match(readme, /thin is not ambiguous and big is not ambiguous/i)
  })

  test("README documents the limitation and the ruled-out workaround", () => {
    assert.match(readme, /## Repo coverage/)
    assert.ok(
      readme.includes(coverageIssueTitle),
      "README must name the same coverage issue the run files, or the run files a duplicate",
    )
    // create_session can't seed every repo at launch — re-deriving that costs a
    // whole run. A web-made Routine can, and the nightly depends on it.
    assert.match(readme, /singular/)
    assert.match(readme, /adding it to the Routines too/)
  })
})

// Grilling never happens in the nightly chat (Isaiah, 2026-10-06): the run
// leaves questions on the issue and he grills each one in its own chat.
describe("grilling happens in its own chat", () => {
  const read = (name: string) =>
    fs.readFileSync(path.join(repoRoot, `.claude/commands/${name}.md`), "utf8")
  const grillCommand = read("backlog-grill")
  const nightlyCommand = read("backlog-nightly")
  const nextCommand = read("backlog-next")
  const workCommand = read("backlog-work")

  // AskUserQuestion is denied in Isaiah's settings, and in an unattended grill
  // chat it freezes on a permission prompt that looks like waiting for an answer.
  test("backlog-grill does not allow the question tool", () => {
    const allowed = grillCommand.match(/^allowed-tools:.*$/m)?.[0] ?? ""
    assert.ok(!allowed.includes("AskUserQuestion"), allowed)
  })

  test("the nightly asks nothing in its own chat", () => {
    assert.match(nightlyCommand, /No questions in this chat, ever/)
    assert.doesNotMatch(nightlyCommand, /Questions for you/)
  })

  test("/backlog-next builds what's ready, else grills the next item", () => {
    assert.match(nextCommand, /\/backlog-work <number>/)
    assert.match(nextCommand, /\/backlog-grill <number>/)
    assert.match(nextCommand, /One item per chat/)
    // Bodies are what make a pick expensive; titles are enough to choose.
    assert.match(nextCommand, /Don't read issue bodies until you've picked/)
    // An issue waiting on auto-merge still looks stalled by morning.
    assert.match(nextCommand, /Built by the nightly backlog run/)
  })

  test("grilling starts from the questions the nightly left", () => {
    assert.match(grillCommand, /If the nightly run left questions there/)
  })

  test("/backlog-work never builds an item that still needs grilling", () => {
    const pick = workCommand.slice(0, workCommand.indexOf("## Reading and writing GitHub"))
    assert.match(pick, /`needs-grilling`/)
  })

  test("independent questions are batched, not one at a time", () => {
    assert.match(grillCommand, /numbered\s+list/)
    assert.match(grillCommand, /[Gg]rill in rounds/)
    // Isaiah, 2026-09-23: grilling asks every question not blocked by another,
    // together. These are the phrasings the files used before.
    for (const [name, text] of [
      ["backlog-grill", grillCommand],
      ["backlog-nightly", nightlyCommand],
      ["backlog-next", nextCommand],
    ] as const) {
      assert.doesNotMatch(
        text,
        /one question at a time|single\s+(specific\s+|blocking\s+|most\s+important\s+)?question|the\s+one\s+question|one\s+or\s+two\s+at\s+a\s+time/i,
        name,
      )
    }
  })
})

// install.sh pushes this into every repo's CLAUDE.md. It must add the rule
// once, keep everything else, and never write an empty or duplicated file.
describe("merge_rule.py", () => {
  const script = path.join(here, "merge_rule.py")
  const run = (input: string | null) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-rule-"))
    const src = path.join(dir, "in.md")
    const dst = path.join(dir, "out.md")
    if (input !== null) fs.writeFileSync(src, input)
    try {
      execFileSync("python3", [script, src, dst])
      return { status: 0, out: fs.readFileSync(dst, "utf8") }
    } catch (error) {
      return { status: (error as { status: number }).status, out: fs.existsSync(dst) ? "x" : "" }
    }
  }

  test("adds the rule under the git heading and keeps the rest", () => {
    const input = "# Intro\ntext\n\n## Git checkpoints\n- one\n- two\n\n## Issues\n- three\n"
    const { status, out } = run(input)
    assert.equal(status, 0)
    assert.match(out, /- two\n- \*\*Merge your own PRs\.\*\*[^\n]*\n\n## Issues\n- three\n$/)
    assert.equal(out.replace(/- \*\*Merge your own PRs\.\*\*[^\n]*\n/, ""), input)
  })

  test("appends a section when there is no git heading", () => {
    const { status, out } = run("# Project\nstuff")
    assert.equal(status, 0)
    assert.match(out, /^# Project\nstuff\n\n# Merging\n\n- \*\*Merge your own PRs/)
  })

  test("creates the file when there is no CLAUDE.md", () => {
    const { status, out } = run(null)
    assert.equal(status, 0)
    assert.match(out, /^# Merging\n\n- \*\*Merge your own PRs/)
  })

  test("does nothing when the rule is already there", () => {
    const { status, out } = run("# Git\n- **Merge your own PRs.** already\n")
    assert.equal(status, 2)
    assert.equal(out, "")
  })
})

// Isaiah, 2026-10-05: dropped Matt Pocock's /triage, keeping its two ideas here.
describe("ideas kept from /triage", () => {
  const add = fs.readFileSync(path.join(repoRoot, ".claude/commands/backlog-add.md"), "utf8")
  const grill = fs.readFileSync(path.join(repoRoot, ".claude/commands/backlog-grill.md"), "utf8")

  test("filing and grilling both check ideas turned down before", () => {
    for (const text of [add, grill]) assert.match(text, /reason:not-planned/)
  })

  test("a grilled issue says what is not in the change", () => {
    assert.match(grill, /Not in this change/)
  })
})
