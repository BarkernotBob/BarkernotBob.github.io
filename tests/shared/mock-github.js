// Mocks the GitHub API the apps talk to, using SYNTHETIC fixture db files
// (never real data — this is a public repo).
//
// SHARED by every app suite (GAP-W2). It used to live in tests/grocery/support/,
// which is why the git-object-store fidelity below is shaped by grocery's needs:
// grocery moved onto the Git Data API, so the mock has to model it properly.
// Apps still on the plain Contents API (bank-bonus) use only the Contents
// section at the bottom, which reads through the same object store.
//
// Callers pass their own `fixturesDir`; nothing about a specific app is baked in.
//
// S1 moved the app onto the **Git Data API**: reads go ref → commit → tree →
// blob (no 1 MB ceiling) and writes are atomic batched commits (blobs → tree on
// base_tree → commit → PATCH ref). This mock therefore emulates a tiny in-memory
// git object store with FAITHFUL response shapes:
//
//   GET  /git/ref/heads/main        → { ref, object:{ sha, type:'commit' } } + ETag
//                                      (honours If-None-Match → 304)
//   GET  /git/commits/{sha}         → { sha, tree:{ sha }, parents:[...] }
//   GET  /git/trees/{sha}?recursive → { sha, tree:[{path,mode,type:'blob',sha}], truncated }
//   GET  /git/blobs/{sha}           → { sha, encoding:'base64', content }
//   POST /git/blobs                 → { sha }          (content stored)
//   POST /git/trees                 → { sha }          (base_tree merged with entries)
//   POST /git/commits               → { sha, tree, parents }
//   PATCH /git/refs/heads/main      → { ref, object } | 422 non-fast-forward on a race
//
// The Contents API is still served for repo-existence checks and image paths
// (the app keeps it only as a fallback / bootstrap path).
const fs = require('fs')
const path = require('path')

const BRANCH = 'main'

// A 1x1 transparent PNG, enough for viewPhoto() to build a data URL.
const TINY_IMG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function b64(str) {
  return Buffer.from(str, 'utf8').toString('base64')
}
function unb64(b) {
  return Buffer.from(b || '', 'base64').toString('utf8')
}
// djb2 → stable content-addressed blob shas so an unchanged file keeps its sha
// across commits (the app's freshness diff relies on "blob sha changed?").
function hash(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(16)
}

function readFixture(fixturesDir, relPath) {
  if (!relPath.startsWith('db/')) return null
  const file = path.join(fixturesDir, relPath.slice(3))
  if (!fs.existsSync(file)) return null
  return fs.readFileSync(file, 'utf8')
}

// Install on a Playwright page.
//   opts.fixturesDir  (required) directory of *.json seeded as db/<name>
//   opts.seedImages   paths to seed with a 1x1 PNG, for apps that store photos
//   opts.oversizeItems / opts.truncateTree  grocery-specific Git Data scenarios
async function installGitHubMock(page, opts = {}) {
  const fixturesDir = opts.fixturesDir
  if (!fixturesDir) throw new Error('installGitHubMock: opts.fixturesDir is required')
  // ---- in-memory git object store ----
  const git = { blobs: {}, trees: {}, commits: {}, head: null }
  let counter = 0
  const putBlob = (contentB64) => {
    const sha = 'blob-' + hash(contentB64)
    git.blobs[sha] = contentB64
    return sha
  }
  const putTree = (map) => {
    const sha = 'tree-' + ++counter
    git.trees[sha] = Object.assign({}, map)
    return sha
  }
  const putCommit = (treeSha, parents) => {
    const sha = 'commit-' + ++counter
    git.commits[sha] = { treeSha, parents: parents || [] }
    return sha
  }
  const headTreeMap = () => git.trees[git.commits[git.head.commitSha].treeSha]
  const currentText = (p) => {
    const sha = headTreeMap()[p]
    return sha != null ? unb64(git.blobs[sha]) : null
  }
  // Advance head with a set of {path: text} overrides — models a concurrent writer.
  const injectRemote = (mods) => {
    const base = Object.assign({}, headTreeMap())
    for (const p in mods) base[p] = putBlob(b64(mods[p]))
    const t = putTree(base)
    const c = putCommit(t, [git.head.commitSha])
    git.head = { commitSha: c, etag: '"' + c + '"' }
  }

  // ---- seed the initial commit from the fixtures ----
  const seedMap = {}
  for (const name of fs.readdirSync(fixturesDir)) {
    if (!name.endsWith('.json')) continue
    let text = fs.readFileSync(path.join(fixturesDir, name), 'utf8')
    if (name === 'items.json' && opts.oversizeItems) {
      const arr = JSON.parse(text)
      const base = arr[0]
      for (let i = 0; i < 6000; i++) {
        arr.push(
          Object.assign({}, base, {
            id: 'i_big_' + i,
            rawName: 'BULK FILLER ITEM NUMBER ' + i + ' XXXXXXXXXXXXXXXXXXXX',
            name: 'Filler item ' + i,
          })
        )
      }
      text = JSON.stringify(arr, null, 2) // > 1 MB
    }
    seedMap['db/' + name] = putBlob(b64(text))
  }
  // Image paths a caller's fixtures reference, so an image lookup resolves
  // through the tree/blob path rather than 404ing.
  if ((opts.seedImages || []).length) {
    const imgSha = putBlob(TINY_IMG_B64)
    for (const imgPath of opts.seedImages) seedMap[imgPath] = imgSha
  }
  const seedTree = putTree(seedMap)
  const seedCommit = putCommit(seedTree, [])
  git.head = { commitSha: seedCommit, etag: '"' + seedCommit + '"' }

  // ---- test-facing handle ----
  const state = {
    commits: [], // one entry per POST /git/commits (app-originated commits)
    refUpdates: 0, // successful PATCH ref
    _raceAppendItem: null,
    _raceMods: null,
    // Arm a one-shot ref race: the NEXT PATCH ref will first append `record` to
    // items.json as a concurrent remote commit, then reject 422. The app must
    // refetch, replay its deltas onto the fresh content, and retry — proving no
    // lost update.
    armRaceAppendItem(record) {
      this._raceAppendItem = record
    },
    // General one-shot race: the NEXT PATCH ref first lands `mods` ({path:text})
    // as a concurrent remote commit, then rejects 422 — used to prove a mutate
    // (config edit) replay preserves the other writer's change.
    armRaceInject(mods) {
      this._raceMods = mods
    },
    // Directly advance main (models the processor committing between polls).
    injectRemote(mods) {
      injectRemote(mods)
    },
    // Read the current committed text of a path (for assertions).
    readFile(p) {
      return currentText(p)
    },
    headSha() {
      return git.head.commitSha
    },
  }

  const json = (route, body, headers) =>
    route.fulfill({ headers: headers || {}, json: body })

  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    const p = url.pathname
    const repoRe = '/repos/[^/]+/[^/]+'

    // --- user + repo-existence probes ---
    if (method === 'GET' && p === '/user') return json(route, { login: 'testuser' })
    const repoOnly = p.match(/^\/repos\/([^/]+)\/([^/]+)$/)
    if (method === 'GET' && repoOnly)
      return json(route, {
        full_name: `${repoOnly[1]}/${repoOnly[2]}`,
        default_branch: BRANCH,
        private: true,
      })

    // --- Git Data: ref ---
    if (method === 'GET' && new RegExp(`^${repoRe}/git/ref/heads/${BRANCH}$`).test(p)) {
      const inm = req.headers()['if-none-match']
      if (inm && inm === git.head.etag)
        return route.fulfill({ status: 304, headers: { etag: git.head.etag }, body: '' })
      return json(
        route,
        { ref: `refs/heads/${BRANCH}`, object: { sha: git.head.commitSha, type: 'commit' } },
        { etag: git.head.etag }
      )
    }
    if (method === 'PATCH' && new RegExp(`^${repoRe}/git/refs/heads/${BRANCH}$`).test(p)) {
      const body = JSON.parse(req.postData() || '{}')
      const newCommit = body.sha
      if (state._raceAppendItem) {
        // One-shot race: a concurrent writer lands first, then we reject.
        const rec = state._raceAppendItem
        state._raceAppendItem = null
        const arr = JSON.parse(currentText('db/items.json'))
        arr.push(rec)
        injectRemote({ 'db/items.json': JSON.stringify(arr, null, 2) })
        return route.fulfill({ status: 422, json: { message: 'Update is not a fast forward' } })
      }
      if (state._raceMods) {
        const mods = state._raceMods
        state._raceMods = null
        injectRemote(mods)
        return route.fulfill({ status: 422, json: { message: 'Update is not a fast forward' } })
      }
      const parent = (git.commits[newCommit] && git.commits[newCommit].parents[0]) || null
      if (parent !== git.head.commitSha)
        return route.fulfill({ status: 422, json: { message: 'Update is not a fast forward' } })
      git.head = { commitSha: newCommit, etag: '"' + newCommit + '"' }
      state.refUpdates++
      return json(route, { ref: `refs/heads/${BRANCH}`, object: { sha: newCommit, type: 'commit' } })
    }

    // --- Git Data: commits ---
    let mm
    if (method === 'GET' && (mm = p.match(new RegExp(`^${repoRe}/git/commits/(.+)$`)))) {
      const c = git.commits[mm[1]]
      if (!c) return route.fulfill({ status: 404, json: { message: 'Not Found' } })
      return json(route, { sha: mm[1], tree: { sha: c.treeSha }, parents: c.parents.map((s) => ({ sha: s })) })
    }
    if (method === 'POST' && new RegExp(`^${repoRe}/git/commits$`).test(p)) {
      const body = JSON.parse(req.postData() || '{}')
      const sha = putCommit(body.tree, body.parents || [])
      state.commits.push({ sha, message: body.message })
      return json(route, { sha, message: body.message, tree: { sha: body.tree }, parents: (body.parents || []).map((s) => ({ sha: s })) })
    }

    // --- Git Data: trees ---
    // Faithful-ish: honours ?recursive=1, models directories as type:'tree'
    // entries on a non-recursive listing, and can simulate GitHub's truncation
    // cap. `DB~<sha>` is a synthetic alias for the db/ subtree of <sha> (what the
    // app fetches when a recursive listing comes back truncated).
    if (method === 'GET' && (mm = p.match(new RegExp(`^${repoRe}/git/trees/(.+?)(?:\\?.*)?$`)) )) {
      let rawSha = decodeURIComponent(mm[1])
      const recursive = url.searchParams.has('recursive')
      let dbOnly = false
      if (rawSha.startsWith('DB~')) { dbOnly = true; rawSha = rawSha.slice(3) }
      const map = git.trees[rawSha]
      if (!map) return route.fulfill({ status: 404, json: { message: 'Not Found' } })

      if (dbOnly) {
        const tree = Object.keys(map)
          .filter((k) => k.startsWith('db/'))
          .map((k) => ({ path: k.slice(3), mode: '100644', type: 'blob', sha: map[k] }))
        return json(route, { sha: mm[1], tree, truncated: false })
      }
      if (recursive) {
        let entries = Object.keys(map).map((k) => ({ path: k, mode: '100644', type: 'blob', sha: map[k] }))
        let truncated = false
        if (opts.truncateTree) {
          // Simulate the cap: db/ blobs are dropped from the recursive listing,
          // forcing the app onto its db-subtree fallback.
          entries = entries.filter((e) => !e.path.startsWith('db/'))
          truncated = true
        }
        return json(route, { sha: mm[1], tree: entries, truncated })
      }
      // Non-recursive: top-level dirs as type:'tree', root files as blobs.
      const dirs = {}
      const entries = []
      Object.keys(map).forEach((k) => {
        const i = k.indexOf('/')
        if (i < 0) entries.push({ path: k, mode: '100644', type: 'blob', sha: map[k] })
        else dirs[k.slice(0, i)] = true
      })
      Object.keys(dirs).forEach((d) =>
        entries.push({ path: d, mode: '040000', type: 'tree', sha: 'DB~' + rawSha })
      )
      return json(route, { sha: mm[1], tree: entries, truncated: false })
    }
    if (method === 'POST' && new RegExp(`^${repoRe}/git/trees$`).test(p)) {
      const body = JSON.parse(req.postData() || '{}')
      const map = body.base_tree ? Object.assign({}, git.trees[body.base_tree] || {}) : {}
      ;(body.tree || []).forEach((e) => {
        map[e.path] = e.sha
      })
      const sha = putTree(map)
      return json(route, { sha, tree: body.tree || [], truncated: false })
    }

    // --- Git Data: blobs ---
    if (method === 'GET' && (mm = p.match(new RegExp(`^${repoRe}/git/blobs/([^/]+)$`)))) {
      const content = git.blobs[mm[1]]
      if (content == null) return route.fulfill({ status: 404, json: { message: 'Not Found' } })
      return json(route, { sha: mm[1], encoding: 'base64', content, size: Buffer.from(content, 'base64').length })
    }
    if (method === 'POST' && new RegExp(`^${repoRe}/git/blobs$`).test(p)) {
      const body = JSON.parse(req.postData() || '{}')
      const sha = putBlob(body.content) // app always sends encoding:'base64'
      return json(route, { sha, url: 'https://api.github.com/blob/' + sha })
    }

    // --- Contents API (fallback / bootstrap only) ---
    const cm = p.match(new RegExp(`^${repoRe}/contents/(.+)$`))
    if (cm) {
      const filePath = decodeURIComponent(cm[1])
      if (method === 'GET') {
        // Oversize items.json would error via Contents (the ceiling the app avoids).
        if (filePath === 'db/items.json' && opts.oversizeItems)
          return route.fulfill({ status: 403, json: { message: 'This API returns blobs up to 1 MB in size. Use the Git Data API instead.' } })
        // Committed state first — otherwise a PUT would never be visible to
        // the app that just made it. The store is seeded from the fixtures, so
        // this matches the fixture until something is written. Served straight
        // from the stored blob: decoding to text and re-encoding would corrupt
        // any binary path (an image) that has been committed.
        const committedSha = headTreeMap()[filePath]
        if (committedSha != null) {
          const stored = git.blobs[committedSha]
          return json(route, {
            name: filePath.split('/').pop(),
            path: filePath,
            sha: committedSha,
            size: Buffer.from(stored, 'base64').length,
            encoding: 'base64',
            content: stored,
            download_url: 'https://raw.example/' + filePath,
          })
        }
        const raw = readFixture(fixturesDir, filePath)
        if (raw != null)
          return json(route, {
            name: filePath.split('/').pop(),
            path: filePath,
            sha: 'sha-' + hash(raw),
            size: raw.length,
            encoding: 'base64',
            content: b64(raw),
            download_url: 'https://raw.example/' + filePath,
          })
        if (/\.(jpe?g|png)$/i.test(filePath))
          return json(route, {
            name: filePath.split('/').pop(),
            path: filePath,
            sha: 'sha-img',
            encoding: 'base64',
            content: TINY_IMG_B64,
            download_url: 'https://raw.example/' + filePath,
          })
        return route.fulfill({ status: 404, json: { message: 'Not Found' } })
      }
      if (method === 'PUT') {
        // Bootstrap path (ensureInitialized) — seed a blob into a new head commit.
        const body = JSON.parse(req.postData() || '{}')
        const sha = putBlob(body.content)
        const map = Object.assign({}, headTreeMap())
        map[filePath] = sha
        const t = putTree(map)
        const c = putCommit(t, [git.head.commitSha])
        git.head = { commitSha: c, etag: '"' + c + '"' }
        return json(route, { content: { path: filePath, sha }, commit: { sha: c } })
      }
    }

    return route.fulfill({ status: 404, json: { message: 'Not Found' } })
  })

  return state
}

module.exports = { installGitHubMock }
