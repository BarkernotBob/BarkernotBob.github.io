// Fully mocks the GitHub REST API the grocery app talks to, using SYNTHETIC
// fixture db files (never real data — this is a public repo). Reads are served
// from tests/grocery/fixtures/db/*.json wrapped in Contents-API-shaped responses;
// writes (PUT/DELETE) succeed with a fresh sha so optimistic-UI flows resolve.
//
// The app only ever hits api.github.com, so a single route covers it. When S1
// moves reads to the Git Data / blobs API, extend the switch below to match.
const fs = require('fs')
const path = require('path')

const FIXturesDir = path.join(__dirname, '..', 'fixtures', 'db')

// A 1x1 transparent JPEG-ish PNG, enough for viewPhoto() to build a data URL.
const TINY_IMG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function b64(str) {
  return Buffer.from(str, 'utf8').toString('base64')
}

function readFixture(relPath) {
  // relPath like "db/items.json"
  if (!relPath.startsWith('db/')) return null
  const file = path.join(FIXturesDir, relPath.slice(3))
  if (!fs.existsSync(file)) return null
  return fs.readFileSync(file, 'utf8')
}

// Install on a Playwright page/context. Returns a small handle exposing the
// number of write calls so flow tests can assert "mark-waste is one commit".
async function installGitHubMock(page) {
  const state = { puts: [], deletes: [] }

  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()

    // /repos/{owner}/{repo}/contents/{path...}
    const m = url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/)

    if (method === 'GET' && url.pathname === '/user') {
      return route.fulfill({ json: { login: 'testuser' } })
    }

    // Repo existence check (saveSetup / testConn / afterSignIn probe this).
    const repoOnly = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)$/)
    if (method === 'GET' && repoOnly) {
      return route.fulfill({
        json: {
          full_name: `${repoOnly[1]}/${repoOnly[2]}`,
          default_branch: 'main',
          private: true,
        },
      })
    }

    if (m) {
      const filePath = decodeURIComponent(m[1])

      if (method === 'GET') {
        const raw = readFixture(filePath)
        if (raw != null) {
          return route.fulfill({
            json: {
              name: filePath.split('/').pop(),
              path: filePath,
              sha: 'sha-' + filePath.replace(/\W/g, '-'),
              size: raw.length,
              encoding: 'base64',
              content: b64(raw),
              download_url: 'https://raw.example/' + filePath,
            },
          })
        }
        // Image or unknown path — hand back a tiny image so viewPhoto works.
        if (/\.(jpe?g|png)$/i.test(filePath)) {
          return route.fulfill({
            json: {
              name: filePath.split('/').pop(),
              path: filePath,
              sha: 'sha-img',
              encoding: 'base64',
              content: TINY_IMG_B64,
              download_url: 'https://raw.example/' + filePath,
            },
          })
        }
        return route.fulfill({ status: 404, json: { message: 'Not Found' } })
      }

      if (method === 'PUT') {
        state.puts.push({ path: filePath, at: Date.now() })
        return route.fulfill({
          json: {
            content: { path: filePath, sha: 'sha-new-' + state.puts.length },
            commit: { sha: 'commit-' + state.puts.length },
          },
        })
      }

      if (method === 'DELETE') {
        state.deletes.push({ path: filePath })
        return route.fulfill({ json: { commit: { sha: 'del-' + state.deletes.length } } })
      }
    }

    // Anything else the app might probe — succeed emptily rather than error.
    return route.fulfill({ status: 404, json: { message: 'Not Found' } })
  })

  return state
}

module.exports = { installGitHubMock }
