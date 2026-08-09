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
