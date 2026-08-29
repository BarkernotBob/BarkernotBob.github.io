const { test, expect } = require('@playwright/test')
const { bootApp, goTab, APP_URL, VIEWPORTS } = require('./support/boot')

// Does the app come up at all, on every tab, without shouting into the console?
// Pool had no tests before this: ~1,400 lines, a GitHub token, and every change
// shipped unverified. This file is the floor.

const TABS = ['today', 'test', 'schedule', 'weather', 'history', 'settings']

test('boots signed in with a clean console', async ({ page }) => {
  const { errors } = await bootApp(page)

  await expect(page.locator('#main')).toContainText('Today')
  // Straight from the fixture config, so this proves the GitHub read landed
  // rather than the app falling back to its built-in defaults.
  await expect(page.locator('#main')).toContainText('Test Pool')
  await expect(page.locator('#main')).toContainText('Springfield, IL')
  expect(errors, errors.join('\n')).toEqual([])
})

test('every tab renders and the console stays clean', async ({ page }) => {
  const { errors } = await bootApp(page)

  for (const tab of TABS) {
    await goTab(page, tab)
    await expect(page.locator(`nav button[data-tab="${tab}"]`)).toHaveClass(/active/)
    // Something actually rendered — not the spinner, not an empty div.
    await expect(page.locator('#main .card').first()).toBeVisible()
    // show() catches its own errors into this card, which would otherwise look
    // like a normal render and pass every other assertion here.
    await expect(page.locator('#main')).not.toContainText('Something went wrong')
  }

  expect(errors, errors.join('\n')).toEqual([])
})

test('talks to nothing but GitHub and Open-Meteo', async ({ page }) => {
  // Pool reads data from GitHub and weather from Open-Meteo. Anything else
  // reaching the network is a new dependency that should be a deliberate
  // decision, not a surprise found later in a privacy review.
  const { external, errors } = await bootApp(page)
  for (const tab of TABS) await goTab(page, tab)

  expect(external, `unexpected third-party requests:\n${external.join('\n')}`).toEqual([])
  expect(errors, errors.join('\n')).toEqual([])
})

test('signed out, it shows the setup screen and never calls GitHub', async ({ page }) => {
  const calls = []
  page.on('request', (req) => {
    if (req.url().startsWith('https://api.github.com/')) calls.push(req.url())
  })

  const { errors } = await bootApp(page, { signedOut: true })

  // isConfigured() is `repo && token`; with neither, show() short-circuits to
  // renderSetup() whichever tab is asked for.
  await expect(page.locator('#main')).toContainText('Connect')
  expect(calls, `called GitHub before sign-in:\n${calls.join('\n')}`).toEqual([])
  expect(errors, errors.join('\n')).toEqual([])
})

test('a reload keeps you signed in and re-reads the data', async ({ page }) => {
  const { errors } = await bootApp(page)
  await expect(page.locator('#main')).toContainText('Test Pool')

  await page.reload()
  await page.locator('#main .card').first().waitFor({ state: 'visible' })

  await expect(page.locator('#main')).toContainText('Test Pool')
  await expect(page.locator('#whoami')).toContainText('testuser')
  expect(errors, errors.join('\n')).toEqual([])
})

test('the due-now badge counts the tasks that are actually due', async ({ page }) => {
  await bootApp(page)

  // Against the pinned clock (2026-07-15) the fixture leaves exactly three
  // tasks due: chlorine (weekly, last 07-01, so 7 days overdue), phosphate
  // (never done) and pump (daily in peak, last 07-14). If this number moves,
  // either a cadence rule changed or the clock came unpinned.
  await expect(page.locator('#todayBadge')).toHaveText('3')
  await expect(page.locator('#todayBadge')).toBeVisible()
})

test('the PWA files are served and parse', async ({ page, request }) => {
  // Service workers are blocked in this rig (see playwright.config.js), so the
  // manifest and worker are checked as files rather than through registration.
  await bootApp(page)

  const manifest = await request.get('/static/pool/manifest.webmanifest')
  expect(manifest.ok()).toBeTruthy()
  const m = JSON.parse(await manifest.text())
  expect(m.name).toBeTruthy()
  expect(m.display).toBe('standalone')
  expect(m.icons.length).toBeGreaterThan(0)

  const sw = await request.get('/static/pool/sw.js')
  expect(sw.ok()).toBeTruthy()

  // The head must actually point at the manifest, or installing the app from a
  // phone falls back to a browser shortcut with no icon.
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    'manifest.webmanifest'
  )
})

test('the phone layout does not scroll sideways', async ({ page }) => {
  // The app is phone-first and CLAUDE.md is explicit that mobile is designed,
  // not shrunk. A horizontal scrollbar at 390px is the usual first symptom of
  // that slipping.
  await bootApp(page, { viewport: VIEWPORTS.mobile })
  for (const tab of TABS) {
    await goTab(page, tab)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow, `${tab} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0)
  }
})

test('the app URL is the one the site links to', async ({ page }) => {
  // Cheap guard against a rename: the rig, the site nav and the manifest's
  // scope all assume /static/pool/.
  await bootApp(page)
  expect(page.url()).toContain(APP_URL)
})
