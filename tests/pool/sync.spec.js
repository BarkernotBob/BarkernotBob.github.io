const { test, expect } = require('@playwright/test')
const { bootApp, goTab, ready, TODAY } = require('./support/boot')

// Observation uses page.on('request'), not page.route(). bootApp installs the
// GitHub mock and a catch-all, and Playwright matches routes most-recently-
// registered first — so a handler added before bootApp never sees the request.
// Request events always fire. Route OVERRIDES therefore have to be registered
// after bootApp and picked up on a reload; the two tests that need one do that.

// The GitHub-backed path, against tests/shared/mock-github.js.
//
// This is the whole storage layer for pool — there is no local mode to fall
// back on, so if these reads and writes are wrong the app has no data at all.
// Since #135 it talks the Git Data API, the same as grocery: reads go
// ref → commit → tree → blob, and every save is ONE commit (blobs → tree on
// base_tree → commit → PATCH ref) whose changes are replayed onto fresh content
// if another device moved main first. The Contents API is only for seeding an
// empty repo.

const CONTENTS_DATA_PATH = /\/contents\/db\//

// Every GitHub request the app makes, as "METHOD path-after-the-repo".
function recordGitHub(page) {
  const calls = []
  page.on('request', (req) => {
    const m = req.url().match(/api\.github\.com\/repos\/[^/]+\/[^/]+\/(.*)$/)
    if (m) calls.push({ method: req.method(), path: m[1], body: req.postData() })
  })
  return calls
}

const log = (mock) => JSON.parse(mock.readFile('db/log.json'))
const config = (mock) => JSON.parse(mock.readFile('db/config.json'))
const chlorineLast = (mock) => config(mock).tasks.find((t) => t.id === 'chlorine').last

async function markChlorineDone(page) {
  await page.locator('#main .item').filter({ hasText: 'Add chlorine' }).getByRole('button', { name: 'Done' }).click()
}

test('boot reads all four data files through ref, commit, tree and blob', async ({ page }) => {
  const calls = recordGitHub(page)
  await bootApp(page)

  const gets = calls.filter((c) => c.method === 'GET').map((c) => c.path.split('?')[0].replace(/\/[^/]+$/, '/…'))
  expect(gets).toContain('git/ref/heads/…')
  expect(gets).toContain('git/commits/…')
  expect(gets).toContain('git/trees/…')
  expect(gets.filter((g) => g === 'git/blobs/…')).toHaveLength(4)
  expect(calls.filter((c) => CONTENTS_DATA_PATH.test(c.path)), 'a data file was read through the Contents API').toEqual([])
})

test('the token is sent as a bearer header and never in the URL', async ({ page }) => {
  // A token in a query string ends up in logs and Referer headers. Worth
  // pinning: this app's whole security story is that the token stays local.
  const urls = []
  let authed = 0
  page.on('request', (req) => {
    if (!req.url().includes('api.github.com')) return
    urls.push(req.url())
    if ((req.headers()['authorization'] || '').startsWith('Bearer ')) authed++
  })

  await bootApp(page)

  await expect.poll(async () => authed).toBeGreaterThan(0)
  for (const u of urls) expect(u, `token leaked into a URL: ${u}`).not.toContain('ghp_test_token')
})

test('a write builds on the commit it read and never force-moves main', async ({ page }) => {
  // What stops a write from clobbering another device's: the new commit's
  // parent is the tip this device read, and the ref update is force:false, so
  // GitHub refuses it if main has moved since. (The old test of this name only
  // checked that a Contents PUT carried a sha — and the retry behind it then
  // overwrote the other device's edit anyway.)
  const calls = recordGitHub(page)
  const { mock } = await bootApp(page)
  const tipBefore = mock.headSha()

  await markChlorineDone(page)
  await expect.poll(async () => chlorineLast(mock)).toBe(TODAY)

  const commit = calls.find((c) => c.method === 'POST' && c.path === 'git/commits')
  expect(JSON.parse(commit.body).parents).toEqual([tipBefore])
  const patches = calls.filter((c) => c.method === 'PATCH' && c.path === 'git/refs/heads/main')
  expect(patches).toHaveLength(1)
  expect(JSON.parse(patches[0].body).force).toBe(false)
  expect(calls.filter((c) => c.method === 'PUT'), 'a save went through the Contents API').toEqual([])
})

test('marking a task done is ONE commit carrying both config.json and log.json', async ({ page }) => {
  const calls = recordGitHub(page)
  const { mock } = await bootApp(page)

  await markChlorineDone(page)
  await expect.poll(async () => log(mock).length).toBe(4)

  // Both files in the same tree, under the same single commit — so they land
  // together or not at all.
  expect(mock.commits).toHaveLength(1)
  const trees = calls.filter((c) => c.method === 'POST' && c.path === 'git/trees')
  expect(trees).toHaveLength(1)
  expect(JSON.parse(trees[0].body).tree.map((e) => e.path).sort()).toEqual(['db/config.json', 'db/log.json'])
  expect(chlorineLast(mock)).toBe(TODAY)
})

test('a failed commit changes neither file — no task marked done without its log entry', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  const configBefore = mock.readFile('db/config.json')
  const logBefore = mock.readFile('db/log.json')

  // Registered after bootApp so it takes precedence over the mock.
  await page.route('**/git/refs/heads/main', (route, req) => {
    if (req.method() === 'PATCH')
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"Server Error"}' })
    return route.fallback()
  })
  await markChlorineDone(page)

  await expect(page.locator('#toast')).toContainText('500')
  expect(mock.readFile('db/config.json')).toBe(configBefore)
  expect(mock.readFile('db/log.json')).toBe(logBefore)
  const appErrors = errors.filter((e) => !/Failed to load resource/.test(e))
  expect(appErrors, appErrors.join('\n')).toEqual([])
})

test("another device's log entry survives a race — replayed onto, not overwritten", async ({ page }) => {
  // The #135 reproduction: a second device appends a swim entry to log.json
  // while this one is marking a task done. Main moves under us, the ref update
  // is rejected, and the save must replay onto the other device's content.
  const { mock, errors } = await bootApp(page)
  const other = { id: 'l_other_device', at: '2026-07-15T11:00:00.000Z', kind: 'swim', title: 'Swam 1 h', by: 'otherdevice' }
  mock.armRaceInject({ 'db/log.json': JSON.stringify([...log(mock), other], null, 2) })

  await markChlorineDone(page)
  await expect.poll(async () => chlorineLast(mock)).toBe(TODAY)

  const final = log(mock)
  expect(final.map((e) => e.id), "the other device's entry was deleted").toContain('l_other_device')
  expect(final.at(-1)).toMatchObject({ kind: 'task', task: 'chlorine' })
  expect(final).toHaveLength(5) // 3 fixture + theirs + ours
  expect(mock.refUpdates).toBe(1)
  const appErrors = errors.filter((e) => !/Failed to load resource/.test(e))
  expect(appErrors, appErrors.join('\n')).toEqual([])
})

test("another device's config edit survives a race with this device's task", async ({ page }) => {
  // Config is one object, so a replay has to apply only THIS save's change to
  // the fresh copy: the other device renamed the pool and marked the basket
  // done; this device marks chlorine done. All three must be in the result.
  const { mock } = await bootApp(page)
  const theirs = config(mock)
  theirs.pool.name = 'Renamed Elsewhere'
  theirs.tasks.find((t) => t.id === 'basket').last = '2026-07-15'
  mock.armRaceInject({ 'db/config.json': JSON.stringify(theirs, null, 2) })

  await markChlorineDone(page)
  await expect.poll(async () => chlorineLast(mock)).toBe(TODAY)

  const final = config(mock)
  expect(final.pool.name).toBe('Renamed Elsewhere')
  expect(final.tasks.find((t) => t.id === 'basket').last).toBe('2026-07-15')
  expect(log(mock).at(-1)).toMatchObject({ task: 'chlorine' })
  // The screen catches up with the other device too, not just the file.
  await goTab(page, 'settings')
  await expect(page.locator('#s_name')).toHaveValue('Renamed Elsewhere')
})

test('a log.json over the 1 MB Contents API ceiling still loads and still saves', async ({ page }) => {
  // log.json grows forever and has no pruning. The Contents API refuses files
  // over 1 MB; blobs are good to 100 MB.
  const big = []
  for (let i = 0; i < 6000; i++)
    big.push({ id: 'l_big_' + i, at: '2026-06-01T12:00:00.000Z', kind: 'task', task: 'pump', title: 'Run the pump — filler entry number ' + i + ' xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', by: 'testuser' })
  const text = JSON.stringify(big, null, 2)
  expect(text.length).toBeGreaterThan(1024 * 1024)

  // The real ceiling, enforced here so a regression to Contents reads fails.
  const { mock, errors } = await bootApp(page, { db: { 'log.json': text } })
  await page.route('**/contents/db/**', (route) =>
    route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"This API returns blobs up to 1 MB in size."}' })
  )
  await page.reload()
  await ready(page)

  await markChlorineDone(page)
  await expect.poll(async () => log(mock).length).toBe(6001)
  expect(log(mock).at(-1)).toMatchObject({ task: 'chlorine' })
  expect(errors.filter((e) => !/Failed to load resource/.test(e))).toEqual([])
})

test('a missing data file falls back to defaults instead of breaking', async ({ page }) => {
  // A fresh data repo has no db/swim.json until something is logged. loadJson()
  // treats a path missing from the tree as "empty", and the History tab has to
  // survive that.
  const { errors } = await bootApp(page, { omit: ['swim.json'] })
  await goTab(page, 'history')

  await expect(page.locator('#main')).toContainText('Swim hours')
  await expect(page.locator('#main')).toContainText('No swim time logged yet')
  await expect(page.locator('#main')).not.toContainText('Something went wrong')
  const appErrors = errors.filter((e) => !/Failed to load resource/.test(e))
  expect(appErrors, appErrors.join('\n')).toEqual([])
})

test('connecting with a repo and token signs you in and loads the data', async ({ page }) => {
  // The setup screen is the first thing a new device sees. It is also the only
  // route the app now recommends (the broad OAuth button was demoted — see
  // DECISION-github-access-scope.md), so it carries the whole sign-in story.
  const { errors } = await bootApp(page, { signedOut: true })

  await expect(page.locator('#main')).toContainText('Welcome to Pool Care')
  await page.fill('#su_repo', 'testuser/pool-data')
  await page.fill('#su_token', 'ghp_test_token')
  await page.fill('#su_device', 'Kitchen iPad')
  await page.getByRole('button', { name: 'Connect' }).click()

  await expect(page.locator('#main')).toContainText('Test Pool', { timeout: 10_000 })
  await expect(page.locator('#whoami')).toContainText('Kitchen iPad')
  expect(await page.evaluate(() => localStorage.getItem('pl_repo'))).toBe('testuser/pool-data')
  expect(errors, errors.join('\n')).toEqual([])
})

test('the setup screen recommends the fine-grained token, not the broad sign-in', async ({ page }) => {
  // Pins the decision recorded in DECISION-github-access-scope.md (#113): the
  // repo + token fields are the primary form and "Sign in with GitHub" is a
  // collapsed fallback that says plainly what it asks for. Easy to undo by
  // accident in a later layout tidy-up.
  await bootApp(page, { signedOut: true })

  const primary = page.getByRole('button', { name: 'Connect' })
  await expect(primary).toBeVisible()

  const fallback = page.locator('details')
  await expect(fallback).toContainText('Other way in')
  await expect(fallback).toContainText('every')
  // Collapsed by default — the broad-scope button must not be the obvious one.
  expect(await fallback.evaluate((d) => d.open)).toBe(false)
})

test('the tip of main is always read fresh, never from the browser cache', async ({ request }) => {
  // GitHub serves git/ref/heads/main with Cache-Control: max-age=60, and a
  // write goes to git/refs/… (plural), which does not evict that cached read.
  // A second save within a minute would then build on a stale tip and fail
  // every retry with 422. The mock cannot model HTTP caching, so pin the
  // source: every read of the ref goes through ghGetRef, which is no-store.
  const src = await (await request.get('/static/pool/index.html')).text()
  expect(src).toMatch(/const ghGetRef = \(\) => ghJson\('GET', `git\/ref\/heads\/\$\{BRANCH\}`, undefined, \{cache:'no-store'\}\)/)
  const refReads = src.match(/git\/ref\/heads/g) || []
  expect(refReads, 'a ref read bypasses ghGetRef').toHaveLength(1)
})
