/**
 * Studio regression suite.  Run: npx tsx --test studio/studio.test.mts
 *
 * The whole safety claim of Studio rests on a few invariants. These tests
 * assert them against the REAL content in content/, not toy fixtures, so the
 * suite gets stronger as the site grows.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "fs"
import os from "os"
import path from "path"
import {
  CONTENT, STATIC, REPO, TRASH, HttpError,
  safeResolve, writeFile, hashOf,
  splitFrontmatter, applyFrontmatter,
  parseBlocks, spliceBlock,
  trashPath, listTrash, restoreFromTrash,
} from "./lib.mjs"

const mdFiles: string[] = []
;(function walk(d: string) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (e.name.endsWith(".md")) mdFiles.push(p)
  }
})(CONTENT)

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "studio-test-"))

// ---------------------------------------------------------------- blocks

test("every content file: replacing each block with itself is a no-op", () => {
  assert.ok(mdFiles.length > 0, "expected content files to exist")
  for (const f of mdFiles) {
    const src = fs.readFileSync(f, "utf8")
    for (const b of parseBlocks(src)) {
      const out = spliceBlock(src, b.start, b.end, b.text)
      assert.equal(out, src, `identity splice changed ${path.relative(REPO, f)} block ${b.i}`)
    }
  }
})

test("every content file: block offsets are ordered, in range, non-overlapping", () => {
  for (const f of mdFiles) {
    const src = fs.readFileSync(f, "utf8")
    const blocks = parseBlocks(src)
    let prevEnd = 0
    for (const b of blocks) {
      assert.ok(b.start >= prevEnd, `${f} block ${b.i} overlaps previous`)
      assert.ok(b.end <= src.length, `${f} block ${b.i} runs past EOF`)
      assert.equal(src.slice(b.start, b.end), b.text, `${f} block ${b.i} text != slice`)
      prevEnd = b.end
    }
  }
})

test("every content file: blocks never reach into the frontmatter", () => {
  for (const f of mdFiles) {
    const src = fs.readFileSync(f, "utf8")
    const fm = splitFrontmatter(src)
    for (const b of parseBlocks(src)) {
      assert.ok(b.start >= fm.bodyOffset, `${path.relative(REPO, f)} block ${b.i} starts inside frontmatter`)
    }
  }
})

test("contiguous raw HTML is coalesced into one block (the index.md case)", () => {
  const src = "---\ntitle: x\n---\n\n<div class=\"a\">\n\n<p>one</p>\n\n<p>two</p>\n\n</div>\n"
  const blocks = parseBlocks(src)
  const html = blocks.filter((b) => b.type === "html")
  assert.equal(html.length, 1, "expected raw HTML run to collapse to a single block")
  assert.ok(html[0].text.includes("<div"), "coalesced block should start at the opening tag")
  assert.ok(html[0].text.includes("</div>"), "coalesced block should reach the closing tag")
})

test("editing one block leaves every other byte untouched", () => {
  const src = fs.readFileSync(path.join(CONTENT, "notes", "Chiasm.md"), "utf8")
  const blocks = parseBlocks(src)
  const target = blocks[1]
  const out = spliceBlock(src, target.start, target.end, "REPLACED")
  assert.equal(out.slice(0, target.start), src.slice(0, target.start), "prefix changed")
  assert.equal(out.slice(target.start + "REPLACED".length), src.slice(target.end), "suffix changed")
})

test("spliceBlock rejects out-of-range and inverted ranges", () => {
  const src = "hello world"
  assert.throws(() => spliceBlock(src, -1, 3, "x"), HttpError)
  assert.throws(() => spliceBlock(src, 0, 999, "x"), HttpError)
  assert.throws(() => spliceBlock(src, 8, 2, "x"), HttpError)
})

// ---------------------------------------------------------- frontmatter

test("frontmatter edits leave the body byte-identical", () => {
  for (const f of mdFiles) {
    const src = fs.readFileSync(f, "utf8")
    const before = splitFrontmatter(src)
    if (!before.raw) continue
    const out = applyFrontmatter(src, { title: "Totally New Title" })
    const after = splitFrontmatter(out)
    assert.equal(
      out.slice(after.bodyOffset),
      src.slice(before.bodyOffset),
      `body changed while editing frontmatter of ${path.relative(REPO, f)}`,
    )
    assert.equal(after.data.title, "Totally New Title")
  }
})

test("frontmatter: null/empty removes a key, values round-trip", () => {
  const src = "---\ntitle: A\ntags:\n  - x\n---\nbody\n"
  assert.equal(splitFrontmatter(applyFrontmatter(src, { tags: null })).data.tags, undefined)
  assert.deepEqual(splitFrontmatter(applyFrontmatter(src, { tags: ["a", "b"] })).data.tags, ["a", "b"])
  assert.equal(splitFrontmatter(applyFrontmatter(src, { order: 3 })).data.order, 3)
})

test("malformed frontmatter YAML does not throw", () => {
  const src = "---\ntitle: [unclosed\n---\nbody\n"
  assert.doesNotThrow(() => splitFrontmatter(src))
  assert.doesNotThrow(() => parseBlocks(src))
})

test("a file with no frontmatter is handled", () => {
  const src = "just a paragraph\n\nand another\n"
  assert.equal(splitFrontmatter(src).bodyOffset, 0)
  assert.equal(parseBlocks(src).length, 2)
})

// ------------------------------------------------------------- path jail

test("path jail rejects traversal and absolute escapes", () => {
  const bad = [
    "../../etc/passwd",
    "content/../../etc/passwd",
    "/etc/passwd",
    "content/../.git/config",
    "quartz/static/../../package.json",
    "",
  ]
  for (const b of bad) assert.throws(() => safeResolve(b), HttpError, `should reject ${JSON.stringify(b)}`)
})

test("path jail accepts legitimate content and static paths", () => {
  assert.ok(safeResolve("content/notes/Chiasm.md").startsWith(CONTENT))
  assert.ok(safeResolve("quartz/static/Hexchain.html", [STATIC]).startsWith(STATIC))
})

test("path jail honours a narrowed root list", () => {
  assert.throws(() => safeResolve("content/notes/Chiasm.md", [STATIC]), HttpError)
})

// ---------------------------------------------------------------- writes

test("stale-hash guard refuses to clobber an outside edit", () => {
  const dir = tmp()
  const f = path.join(dir, "note.md")
  fs.writeFileSync(f, "original\n")

  const staleHash = hashOf("original\n")
  fs.writeFileSync(f, "changed by Obsidian\n") // someone else edits

  assert.throws(
    () => writeFile(f, "my edit\n", staleHash),
    (err: any) => err instanceof HttpError && err.status === 409 && err.extra.conflict === true,
  )
  assert.equal(fs.readFileSync(f, "utf8"), "changed by Obsidian\n", "conflicting write must not land")
  fs.rmSync(dir, { recursive: true, force: true })
})

test("matching hash allows the write", () => {
  const dir = tmp()
  const f = path.join(dir, "note.md")
  fs.writeFileSync(f, "original\n")
  writeFile(f, "my edit\n", hashOf("original\n"))
  assert.equal(fs.readFileSync(f, "utf8"), "my edit\n")
  fs.rmSync(dir, { recursive: true, force: true })
})

test("writes leave no temp files behind", () => {
  const dir = tmp()
  const f = path.join(dir, "note.md")
  writeFile(f, "a\n")
  writeFile(f, "b\n", hashOf("a\n"))
  assert.deepEqual(fs.readdirSync(dir), ["note.md"])
  fs.rmSync(dir, { recursive: true, force: true })
})

test("backups of an out-of-repo path stay inside .studio-backups", () => {
  const dir = tmp()
  const f = path.join(dir, "escape.md")
  fs.writeFileSync(f, "v1\n")
  writeFile(f, "v2\n", hashOf("v1\n")) // triggers a backup of an outside path

  const stray = path.resolve(REPO, "..", "_external")
  assert.ok(!fs.existsSync(stray), "backup escaped the repo")
  const parked = path.join(REPO, ".studio-backups", "_external")
  assert.ok(fs.existsSync(parked), "outside-repo backup should land in _external")
  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(parked, { recursive: true, force: true })
})

// ---------------------------------------------------------------- trash

test("trash records where a file came from, and restores it exactly there", () => {
  const dir = path.join(CONTENT, "_studio_trash_test")
  const f = path.join(dir, "Round Trip.md")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(f, "---\ntitle: Round Trip\n---\n\nbody\n")

  const trashed = trashPath(f)
  assert.ok(!fs.existsSync(f), "file should have left its original location")

  const item = listTrash().find((t) => t.original.endsWith("Round Trip.md"))
  assert.ok(item, "trashed file should be listed")
  assert.equal(item.title, "Round Trip")
  assert.ok(!isNaN(new Date(item.at).getTime()), "trash timestamp must be a real date")

  restoreFromTrash(item.name)
  assert.equal(fs.readFileSync(f, "utf8"), "---\ntitle: Round Trip\n---\n\nbody\n", "restored content must be identical")

  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.join(REPO, trashed), { force: true })
})

test("restore refuses to overwrite a file that is already back", () => {
  const dir = path.join(CONTENT, "_studio_trash_test2")
  const f = path.join(dir, "Clash.md")
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(f, "one\n")
  trashPath(f)
  fs.writeFileSync(f, "someone recreated it\n") // same path occupied again

  const item = listTrash().find((t) => t.original.endsWith("Clash.md"))!
  assert.throws(() => restoreFromTrash(item.name), (e: any) => e instanceof HttpError && e.status === 409)
  assert.equal(fs.readFileSync(f, "utf8"), "someone recreated it\n", "restore must not clobber")

  fs.rmSync(dir, { recursive: true, force: true })
  fs.rmSync(path.join(TRASH, item.name), { force: true })
  fs.rmSync(path.join(TRASH, `${item.name}.studio.json`), { force: true })
})

test("trash names can't be used to escape the trash folder", () => {
  for (const bad of ["../secret.md", "sub/dir.md", ""]) {
    assert.throws(() => restoreFromTrash(bad), HttpError, `should reject ${JSON.stringify(bad)}`)
  }
})

// ------------------------------------------------------- deploy isolation

test("the production build path never touches Studio", () => {
  const deploy = fs.readFileSync(path.join(REPO, ".github/workflows/deploy.yml"), "utf8")

  // CI is allowed to RUN this suite (there's a `studio_test` job). What it must
  // never do is let Studio into the job that produces the published artifact.
  // So scope the check to the `build:` job rather than the whole file.
  const lines = deploy.split("\n")
  const from = lines.findIndex((l) => /^ {2}build:\s*$/.test(l))
  assert.ok(from >= 0, "deploy.yml should still define a `build:` job")
  let to = lines.length
  for (let i = from + 1; i < lines.length; i++) {
    if (/^ {2}\S/.test(lines[i])) { to = i; break } // next top-level job
  }
  const buildJob = lines.slice(from, to).join("\n")
  assert.ok(!/studio/i.test(buildJob), "the build job must not reference Studio")

  // ...and the Studio server must never be started anywhere in CI.
  assert.ok(!/studio\/server/i.test(deploy), "CI must never start the Studio server")
  assert.ok(!/overlay\.(js|css)/i.test(deploy), "CI must never ship the Studio overlay")

  const cfg = fs.readFileSync(path.join(REPO, "quartz.config.default.yaml"), "utf8")
  assert.ok(!/studio/i.test(cfg), "quartz config must not reference Studio")
})

test("the overlay is never emitted into the built site", () => {
  const publicDir = path.join(REPO, "public")
  if (!fs.existsSync(publicDir)) return // not built yet
  const hits: string[] = []
  ;(function walk(d: string) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith(".html") && fs.readFileSync(p, "utf8").includes("__studio")) {
        hits.push(path.relative(REPO, p))
      }
    }
  })(publicDir)
  assert.deepEqual(hits, [], "built HTML must not contain the Studio overlay")
})
