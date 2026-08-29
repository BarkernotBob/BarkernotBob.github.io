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
// It talks the plain Contents API (GET/PUT /repos/:r/contents/:path with a sha
// for optimistic concurrency), not the Git Data API grocery moved onto.

test('boot reads all four data files', async ({ page }) => {
  const reads = []
  page.on('request', (req) => {
    const u = req.url()
    if (req.method() === 'GET' && u.includes('api.github.com') && u.includes('/contents/'))
      reads.push(u.split('/contents/')[1])
  })

  await bootApp(page)

  await expect.poll(async () => reads.slice().sort()).toEqual([
    'db/config.json',
    'db/log.json',
    'db/swim.json',
    'db/tests.json',
  ])
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

test('a write sends the previous sha, so a concurrent edit cannot be clobbered', async ({ page }) => {
  const puts = []
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes('/contents/'))
      puts.push(JSON.parse(req.postData() || '{}'))
  })

  const { mock } = await bootApp(page)
  await page.locator('#main .item').filter({ hasText: 'Add chlorine' }).getByRole('button', { name: 'Done' }).click()
  await expect
    .poll(async () => JSON.parse(mock.readFile('db/config.json')).tasks.find((t) => t.id === 'chlorine').last)
    .toBe(TODAY)

  await expect.poll(async () => puts.length).toBeGreaterThan(0)
  // Every write carries the sha the app last read — that is what makes GitHub
  // reject a write against a file someone else already changed.
  for (const body of puts) expect(body.sha, 'a write went out with no sha').toBeTruthy()
})

test('a stale sha is retried once against fresh content', async ({ page }) => {
  // saveJson() catches 409/422, re-reads the file for its current sha and puts
  // again. Without that, one edit from a second device turns every later save
  // on this one into a silent failure until a reload.
  const { mock, errors } = await bootApp(page)

  let rejected = false
  // Registered after bootApp so it takes precedence over the mock.
  await page.route('**/contents/db/config.json', (route, req) => {
    if (req.method() === 'PUT' && !rejected) {
      rejected = true
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: '{"message":"is at ... but expected ..."}',
      })
    }
    return route.fallback()
  })

  await page.locator('#main .item').filter({ hasText: 'Add chlorine' }).getByRole('button', { name: 'Done' }).click()

  await expect
    .poll(async () => JSON.parse(mock.readFile('db/config.json')).tasks.find((t) => t.id === 'chlorine').last)
    .toBe(TODAY)
  expect(rejected, 'the 409 never fired, so the retry was not exercised').toBe(true)
  const appErrors = errors.filter((e) => !/Failed to load resource/.test(e))
  expect(appErrors, appErrors.join('\n')).toEqual([])
})

test('a missing data file falls back to defaults instead of breaking', async ({ page }) => {
  // A fresh data repo has no db/swim.json until something is logged. loadJson()
  // treats a 404 as "empty", and the History tab has to survive that.
  const { errors } = await bootApp(page)

  // Registered after bootApp so it takes precedence over the mock, then picked
  // up on the reload below.
  await page.route('**/contents/db/swim.json', (route, req) => {
    if (req.method() === 'GET')
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Not Found"}' })
    return route.fallback()
  })
  await page.reload()
  await ready(page)
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
