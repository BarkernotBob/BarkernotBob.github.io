/**
 * Studio server.
 *
 * Sits in front of Quartz's own dev server and does two things:
 *   - proxies every request through, injecting the editor overlay into HTML
 *   - exposes a small write API under /__studio/api/
 *
 * It never changes how pages are built, so a normal `quartz build` (and CI)
 * produces byte-identical output whether Studio exists or not.
 *
 * Binds to 127.0.0.1 only. The write API must never be reachable off-machine.
 */
import http from "http"
import fs from "fs"
import path from "path"
import { spawn } from "child_process"
import { slugifyFilePath } from "../quartz/util/path"
import {
  REPO, CONTENT, STATIC, HttpError,
  safeResolve, readFile, writeFile, hashOf,
  splitFrontmatter, applyFrontmatter,
  parseBlocks, spliceBlock, EXPECTED_TAGS, trashPath,
} from "./lib.mjs"

const STUDIO_PORT = Number(process.env.STUDIO_PORT ?? 8081)
const QUARTZ_ORIGIN = process.env.QUARTZ_ORIGIN ?? "http://127.0.0.1:8080"
const HOST = "127.0.0.1"

// ------------------------------------------------------------- slug index

/** slug -> absolute markdown path, built with Quartz's own slugifier. */
function buildSlugIndex(): Map<string, string> {
  const idx = new Map<string, string>()
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith(".md")) {
        const rel = path.relative(CONTENT, p)
        idx.set(slugifyFilePath(rel as any), p)
      }
    }
  }
  walk(CONTENT)
  return idx
}

let slugIndex = buildSlugIndex()
let slugIndexAt = Date.now()
function slugLookup(urlPath: string): string | null {
  if (Date.now() - slugIndexAt > 1500) { slugIndex = buildSlugIndex(); slugIndexAt = Date.now() }
  let p = decodeURIComponent(urlPath).replace(/^\/+|\/+$/g, "")
  if (p.endsWith(".html")) p = p.slice(0, -5)
  if (p === "") p = "index"
  return slugIndex.get(p) ?? slugIndex.get(`${p}/index`) ?? null
}

// ------------------------------------------------------------- content tree

function contentTree() {
  const out: { path: string; slug: string; title: string; dir: string; tags: string[] }[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith(".md")) {
        const rel = path.relative(CONTENT, p)
        const fm = splitFrontmatter(fs.readFileSync(p, "utf8"))
        const tags = fm.data.tags
        out.push({
          path: path.relative(REPO, p),
          slug: slugifyFilePath(rel as any),
          title: fm.data.title ?? path.basename(rel, ".md"),
          dir: path.dirname(rel) === "." ? "" : path.dirname(rel),
          tags: Array.isArray(tags) ? tags : tags ? [String(tags)] : [],
        })
      }
    }
  }
  walk(CONTENT)
  return out
}

function allTags(): string[] {
  const s = new Set<string>()
  for (const f of contentTree()) f.tags.forEach((t) => s.add(t))
  return [...s].sort()
}

// ------------------------------------------------------------- helpers

const json = (res: http.ServerResponse, status: number, body: unknown) => {
  const payload = JSON.stringify(body)
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  res.end(payload)
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > 8 * 1024 * 1024) throw new HttpError(413, "payload too large")
    chunks.push(c as Buffer)
  }
  if (!chunks.length) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    throw new HttpError(400, "invalid JSON body")
  }
}

const git = (args: string[]) =>
  new Promise<{ code: number; out: string }>((resolve) => {
    const p = spawn("git", args, { cwd: REPO })
    let out = ""
    p.stdout.on("data", (d) => (out += d))
    p.stderr.on("data", (d) => (out += d))
    p.on("close", (code) => resolve({ code: code ?? 1, out }))
  })

// ------------------------------------------------------------- API

async function handleApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
  const route = url.pathname.replace("/__studio/api/", "")

  // ---- page: source + blocks for the page at a given site path
  if (route === "page" && req.method === "GET") {
    const abs = slugLookup(url.searchParams.get("slug") ?? "")
    if (!abs) return json(res, 404, { error: "no markdown file maps to that URL" })
    const { source, hash } = readFile(abs)
    const fm = splitFrontmatter(source)
    return json(res, 200, {
      path: path.relative(REPO, abs),
      source, hash,
      frontmatter: fm.data,
      bodyOffset: fm.bodyOffset,
      blocks: parseBlocks(source),
      expectedTags: EXPECTED_TAGS,
    })
  }

  // ---- static html file (the standalone apps/games)
  if (route === "static" && req.method === "GET") {
    const name = url.searchParams.get("name") ?? ""
    const abs = safeResolve(path.join("quartz/static", path.basename(name)), [STATIC])
    const { source, hash } = readFile(abs)
    return json(res, 200, { path: path.relative(REPO, abs), source, hash })
  }

  if (route === "tree" && req.method === "GET") return json(res, 200, { files: contentTree(), tags: allTags() })

  if (route === "status" && req.method === "GET") {
    const { out } = await git(["status", "--porcelain"])
    const lines = out.split("\n").filter(Boolean)
    return json(res, 200, { dirty: lines.length, files: lines.slice(0, 50) })
  }

  // ---- write a single block (the core edit path)
  if (route === "block" && req.method === "POST") {
    const b = await readBody(req)
    const abs = safeResolve(b.path, [CONTENT])
    const { source } = readFile(abs)
    const next = spliceBlock(source, b.start, b.end, String(b.text ?? ""))
    const { hash } = writeFile(abs, next, b.hash)
    return json(res, 200, { ok: true, hash })
  }

  // ---- write a whole file (source mode + static html)
  if (route === "source" && req.method === "POST") {
    const b = await readBody(req)
    const abs = safeResolve(b.path, [CONTENT, STATIC])
    const { hash } = writeFile(abs, String(b.text ?? ""), b.hash)
    return json(res, 200, { ok: true, hash })
  }

  // ---- frontmatter patch (title / tags / publish / order)
  if (route === "frontmatter" && req.method === "POST") {
    const b = await readBody(req)
    const abs = safeResolve(b.path, [CONTENT])
    const { source } = readFile(abs)
    const { hash } = writeFile(abs, applyFrontmatter(source, b.patch ?? {}), b.hash)
    return json(res, 200, { ok: true, hash })
  }

  // ---- new page
  if (route === "create" && req.method === "POST") {
    const b = await readBody(req)
    const title = String(b.title ?? "").trim()
    if (!title) throw new HttpError(400, "title required")
    if (/[/\\:\0]/.test(title)) throw new HttpError(400, "title cannot contain / \\ or :")
    const dir = String(b.dir ?? "").replace(/^\/+|\/+$/g, "")
    const abs = safeResolve(path.join("content", dir, `${title}.md`), [CONTENT])
    if (fs.existsSync(abs)) throw new HttpError(409, "a page with that name already exists here")
    const today = new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" })
    writeFile(abs, `---\ntitle: ${title}\ncreated: ${today}\npublish: true\n---\n\nStart writing here.\n`)
    slugIndexAt = 0
    return json(res, 200, {
      ok: true,
      path: path.relative(REPO, abs),
      slug: slugifyFilePath(path.relative(CONTENT, abs) as any),
    })
  }

  // ---- move / rename
  if (route === "move" && req.method === "POST") {
    const b = await readBody(req)
    const from = safeResolve(b.from, [CONTENT])
    const to = safeResolve(b.to, [CONTENT])
    if (!fs.existsSync(from)) throw new HttpError(404, "source page not found")
    if (fs.existsSync(to)) throw new HttpError(409, "a page already exists at that destination")
    fs.mkdirSync(path.dirname(to), { recursive: true })
    const r = await git(["mv", path.relative(REPO, from), path.relative(REPO, to)])
    if (r.code !== 0) fs.renameSync(from, to) // untracked file: plain rename
    slugIndexAt = 0
    return json(res, 200, {
      ok: true,
      slug: slugifyFilePath(path.relative(CONTENT, to) as any),
    })
  }

  // ---- delete (to trash, never permanent)
  if (route === "delete" && req.method === "POST") {
    const b = await readBody(req)
    const abs = safeResolve(b.path, [CONTENT])
    if (!fs.existsSync(abs)) throw new HttpError(404, "page not found")
    const dest = trashPath(abs)
    slugIndexAt = 0
    return json(res, 200, { ok: true, trashedTo: dest })
  }

  // ---- publish (streams the real publish script over SSE)
  if (route === "publish" && req.method === "POST") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    })
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    const script = path.join(REPO, "Publish Changes.command")
    const child = spawn("/bin/zsh", [script], { cwd: REPO, env: { ...process.env, STUDIO: "1" } })
    child.stdout.on("data", (d) => send("log", String(d)))
    child.stderr.on("data", (d) => send("log", String(d)))
    child.on("close", (code) => {
      send("done", { code })
      res.end()
    })
    req.on("close", () => child.kill())
    return
  }

  throw new HttpError(404, `unknown api route: ${route}`)
}

// ------------------------------------------------------------- overlay assets

const asset = (name: string) => fs.readFileSync(path.join(import.meta.dirname, name), "utf8")

const INJECT = `
<link rel="stylesheet" href="/__studio/overlay.css">
<script src="/__studio/overlay.js" defer></script>
`

// ------------------------------------------------------------- proxy

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${STUDIO_PORT}`)

  try {
    if (url.pathname === "/__studio/overlay.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" })
      return res.end(asset("overlay.js"))
    }
    if (url.pathname === "/__studio/overlay.css") {
      res.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" })
      return res.end(asset("overlay.css"))
    }
    if (url.pathname.startsWith("/__studio/api/")) return await handleApi(req, res, url)
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 500
    if (status === 500) console.error("[studio]", err)
    if (!res.headersSent) return json(res, status, { error: err.message, ...(err.extra ?? {}) })
    return res.end()
  }

  // ---- everything else: proxy to Quartz
  try {
    const upstream = await fetch(QUARTZ_ORIGIN + url.pathname + url.search, {
      method: req.method,
      headers: { ...(req.headers as any), host: new URL(QUARTZ_ORIGIN).host },
      body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : (req as any),
      // @ts-expect-error node fetch streaming body
      duplex: "half",
      redirect: "manual",
    })

    const type = upstream.headers.get("content-type") ?? ""
    const headers: Record<string, string> = {}
    upstream.headers.forEach((v, k) => {
      if (!["content-encoding", "content-length", "transfer-encoding"].includes(k)) headers[k] = v
    })

    if (type.includes("text/html")) {
      let html = await upstream.text()
      // Inject before </body>; fall back to appending so we never silently no-op.
      html = html.includes("</body>") ? html.replace("</body>", `${INJECT}</body>`) : html + INJECT
      headers["cache-control"] = "no-store"
      res.writeHead(upstream.status, headers)
      return res.end(html)
    }

    res.writeHead(upstream.status, headers)
    if (!upstream.body) return res.end()
    return res.end(Buffer.from(await upstream.arrayBuffer()))
  } catch {
    res.writeHead(502, { "content-type": "text/html; charset=utf-8" })
    res.end(
      `<html><body style="font:16px system-ui;padding:3rem;max-width:40rem;margin:auto">
       <h1>Waiting for the site…</h1>
       <p>Studio is running, but the Quartz preview at <code>${QUARTZ_ORIGIN}</code> hasn't started yet.</p>
       <p>This page will keep retrying — give it a few seconds.</p>
       <script>setTimeout(()=>location.reload(),2000)</script>
       </body></html>`,
    )
  }
})

server.listen(STUDIO_PORT, HOST, () => {
  console.log(`\n  Studio ready:  http://localhost:${STUDIO_PORT}\n  (proxying ${QUARTZ_ORIGIN}, editing ${path.relative(REPO, CONTENT)}/)\n`)
})
