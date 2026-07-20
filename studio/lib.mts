/**
 * Studio core: safe file access + source-block parsing.
 *
 * Everything that touches disk goes through here. Two rules make Studio safe:
 *   1. Every path is jailed to content/ or quartz/static/ before it is opened.
 *   2. Every write is atomic (tmp + rename), backed up, and guarded by a hash
 *      of the file the edit was based on — so a change made in Obsidian or by a
 *      git pull can never be silently clobbered.
 */
import fs from "fs"
import path from "path"
import crypto from "crypto"
import { unified } from "unified"
import remarkParse from "remark-parse"
import YAML from "yaml"

export const REPO = path.resolve(import.meta.dirname, "..")
export const CONTENT = path.join(REPO, "content")
export const STATIC = path.join(REPO, "quartz", "static")
export const BACKUPS = path.join(REPO, ".studio-backups")
export const TRASH = path.join(REPO, ".studio-trash")

const KEEP_BACKUPS = 30

// ---------------------------------------------------------------- path jail

/**
 * Resolve a caller-supplied path and assert it lives inside an allowed root.
 * Rejects traversal, absolute escapes, and symlinks pointing outside the repo.
 */
export function safeResolve(rel: string, roots: string[] = [CONTENT, STATIC]): string {
  if (typeof rel !== "string" || rel.length === 0) throw new HttpError(400, "missing path")
  if (rel.includes("\0")) throw new HttpError(400, "bad path")

  // Accept either repo-relative ("content/notes/x.md") or root-relative.
  const abs = path.resolve(REPO, rel)
  const ok = roots.some((r) => abs === r || abs.startsWith(r + path.sep))
  if (!ok) throw new HttpError(403, `path outside allowed roots: ${rel}`)

  // If it exists, make sure it isn't a symlink escaping the jail.
  if (fs.existsSync(abs)) {
    const real = fs.realpathSync(abs)
    const realOk = roots.some((r) => {
      const rr = fs.realpathSync(r)
      return real === rr || real.startsWith(rr + path.sep)
    })
    if (!realOk) throw new HttpError(403, `symlink escapes allowed roots: ${rel}`)
  }
  return abs
}

export class HttpError extends Error {
  status: number
  extra: Record<string, unknown>
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

// ---------------------------------------------------------------- hashing

export const hashOf = (s: string) => crypto.createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16)

export function readFile(abs: string): { source: string; hash: string } {
  if (!fs.existsSync(abs)) throw new HttpError(404, `not found: ${path.relative(REPO, abs)}`)
  const source = fs.readFileSync(abs, "utf8")
  return { source, hash: hashOf(source) }
}

// ---------------------------------------------------------------- writing

/**
 * Where a backup of `abs` belongs, always inside BACKUPS.
 * Callers reach writeFile through the path jail, but backup() must not rely on
 * that: a path outside the repo would otherwise produce "../.." segments that
 * escape the backup folder entirely.
 */
function backupDest(abs: string): { dir: string; base: string } {
  let rel = path.relative(REPO, abs)
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    rel = path.join("_external", path.basename(abs))
  }
  const dir = path.resolve(BACKUPS, path.dirname(rel))
  if (dir !== BACKUPS && !dir.startsWith(BACKUPS + path.sep)) {
    return { dir: path.join(BACKUPS, "_external"), base: path.basename(abs) }
  }
  return { dir, base: path.basename(rel) }
}

export function backup(abs: string) {
  if (!fs.existsSync(abs)) return
  const { dir, base: bname } = backupDest(abs)
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const base = bname
  fs.copyFileSync(abs, path.join(dir, `${stamp}__${base}`))

  // prune: keep the most recent N backups for this file
  const mine = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(`__${base}`))
    .sort()
  for (const old of mine.slice(0, Math.max(0, mine.length - KEEP_BACKUPS))) {
    fs.rmSync(path.join(dir, old), { force: true })
  }
}

/**
 * Atomic write with a stale-edit guard.
 * `expectHash` is the hash of the content the caller based its edit on. If the
 * file on disk no longer hashes to that, we refuse and hand back the current
 * source so the UI can show a conflict instead of destroying someone's work.
 */
export function writeFile(abs: string, next: string, expectHash?: string) {
  if (expectHash !== undefined && fs.existsSync(abs)) {
    const current = fs.readFileSync(abs, "utf8")
    const actual = hashOf(current)
    if (actual !== expectHash) {
      throw new HttpError(409, "file changed on disk since you started editing", {
        conflict: true,
        currentSource: current,
        currentHash: actual,
      })
    }
  }
  backup(abs)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  const tmp = `${abs}.studio-tmp-${process.pid}`
  fs.writeFileSync(tmp, next, "utf8")
  fs.renameSync(tmp, abs) // atomic on the same filesystem
  return { hash: hashOf(next) }
}

// ---------------------------------------------------------------- frontmatter

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/

export type Frontmatter = { raw: string; data: Record<string, any>; bodyOffset: number }

export function splitFrontmatter(src: string): Frontmatter {
  const m = src.match(FM_RE)
  if (!m) return { raw: "", data: {}, bodyOffset: 0 }
  let data: Record<string, any> = {}
  try {
    data = YAML.parse(m[1]) ?? {}
  } catch {
    data = {} // malformed YAML: surface as empty, never crash the editor
  }
  return { raw: m[0], data, bodyOffset: m[0].length }
}

/** Rewrite only the frontmatter block, leaving the body byte-identical. */
export function applyFrontmatter(src: string, patch: Record<string, any>): string {
  const fm = splitFrontmatter(src)
  const merged: Record<string, any> = { ...fm.data }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") delete merged[k]
    else merged[k] = v
  }
  const body = src.slice(fm.bodyOffset)
  if (Object.keys(merged).length === 0) return body
  const yaml = YAML.stringify(merged, { lineWidth: 0 }).trimEnd()
  return `---\n${yaml}\n---\n${body}`
}

// ---------------------------------------------------------------- blocks

export type Block = {
  i: number
  type: string
  /** absolute byte offsets into the whole file, frontmatter included */
  start: number
  end: number
  text: string
}

/**
 * Top-level source blocks with absolute offsets.
 *
 * Contiguous raw-HTML nodes are coalesced: remark emits one `html` node per
 * line-run, but they render as a single DOM subtree, so they must be one
 * editable block or the DOM mapping breaks (this is what index.md hits).
 */
export function parseBlocks(src: string): Block[] {
  const fm = splitFrontmatter(src)
  const body = src.slice(fm.bodyOffset)
  const tree = unified().use(remarkParse).parse(body) as any

  const raw: { type: string; start: number; end: number }[] = []
  for (const n of tree.children) {
    if (!n.position) continue
    const start = fm.bodyOffset + n.position.start.offset
    const end = fm.bodyOffset + n.position.end.offset
    const prev = raw[raw.length - 1]
    if (n.type === "html" && prev && prev.type === "html") prev.end = end
    else raw.push({ type: n.type, start, end })
  }
  return raw.map((b, i) => ({ i, ...b, text: src.slice(b.start, b.end) }))
}

/** mdast block type -> HTML tags it may legitimately render as. null = any. */
export const EXPECTED_TAGS: Record<string, string[] | null> = {
  paragraph: ["p", "div", "figure", "img", "a", "span"],
  heading: ["h1", "h2", "h3", "h4", "h5", "h6"],
  list: ["ul", "ol"],
  code: ["pre", "figure", "div"],
  blockquote: ["blockquote", "div"],
  thematicBreak: ["hr"],
  table: ["table", "div", "figure"],
  math: ["div", "p", "span", "figure"],
  html: null,
  definition: null,
  footnoteDefinition: null,
  yaml: null,
}

/** Splice new text over a block's byte range. The only mutation we ever do. */
export function spliceBlock(src: string, start: number, end: number, text: string): string {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > src.length || start > end) {
    throw new HttpError(400, "invalid block range")
  }
  return src.slice(0, start) + text + src.slice(end)
}

// ---------------------------------------------------------------- trash

/**
 * Soft delete. The flat file name is only for humans reading the folder in
 * Finder; the authoritative "where did this come from" lives in a sidecar
 * manifest, so restoring never has to un-mangle a file name.
 */
export function trashPath(abs: string): string {
  const rel = path.relative(REPO, abs)
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const name = `${stamp}__${rel.replace(/[/\\]/g, "__")}`
  fs.mkdirSync(TRASH, { recursive: true })
  fs.renameSync(abs, path.join(TRASH, name))
  fs.writeFileSync(
    path.join(TRASH, `${name}.studio.json`),
    JSON.stringify({ original: rel, at: new Date().toISOString() }, null, 2),
  )
  return path.relative(REPO, path.join(TRASH, name))
}

export type TrashItem = { name: string; original: string; at: string; title: string }

export function listTrash(): TrashItem[] {
  if (!fs.existsSync(TRASH)) return []
  const out: TrashItem[] = []
  for (const name of fs.readdirSync(TRASH)) {
    if (name.endsWith(".studio.json")) continue
    let original = ""
    let at = ""
    try {
      const m = JSON.parse(fs.readFileSync(path.join(TRASH, `${name}.studio.json`), "utf8"))
      original = String(m.original ?? "")
      at = String(m.at ?? "")
    } catch {
      // Pre-manifest trash (or a hand-dropped file): fall back to the name,
      // which is an ISO stamp with every ":" and "." swapped for "-".
      const [stamp, ...rest] = name.split("__")
      original = rest.join("/")
      const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/.exec(stamp)
      at = m ? `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z` : ""
    }
    out.push({ name, original, at, title: path.basename(original || name).replace(/\.md$/, "") })
  }
  return out.sort((a, b) => b.name.localeCompare(a.name))
}

/** Put a trashed file back where it came from. Refuses to overwrite. */
export function restoreFromTrash(name: string): string {
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) throw new HttpError(400, "bad trash name")
  const src = path.join(TRASH, name)
  if (!fs.existsSync(src)) throw new HttpError(404, "that item is no longer in the trash")

  const item = listTrash().find((t) => t.name === name)
  if (!item?.original) throw new HttpError(400, "can't tell where this file came from")

  const dest = safeResolve(item.original, [CONTENT, STATIC])
  if (fs.existsSync(dest)) throw new HttpError(409, `a file already exists at ${item.original}`)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.renameSync(src, dest)
  fs.rmSync(`${src}.studio.json`, { force: true })
  return item.original
}
