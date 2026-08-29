const { test, expect } = require('@playwright/test')
const { bootApp, goTab, stored, VIEWPORTS } = require('./support/boot')

// Does the app come up, on every view, without shouting into the console?
// Vehicle had no tests before this: ~1,240 lines and, per the audit, five pull
// requests mostly re-covering the same ground.

const TABS = ['garage', 'compare', 'settings']

test('boots with a clean console and the seeded garage', async ({ page }) => {
  const { errors } = await bootApp(page)

  await expect(page.locator('#app')).toContainText('Garage')
  // Straight from the fixture, so this proves the saved state was read rather
  // than the app falling back to its 16 built-in samples.
  await expect(page.locator('#app')).toContainText('Testa Voltage')
  await expect(page.locator('#app')).toContainText('3 vehicles')
  expect(errors, errors.join('\n')).toEqual([])
})

test('every tab renders and the console stays clean', async ({ page }) => {
  const { errors } = await bootApp(page)

  for (const tab of TABS) {
    await goTab(page, tab)
    await expect(page.locator(`#tabnav button[data-tab="${tab}"]`)).toHaveClass(/on/)
    await expect(page.locator('#app .view').first()).toBeVisible()
  }

  expect(errors, errors.join('\n')).toEqual([])
})

test('the app sends no data anywhere', async ({ page }) => {
  // Vehicle's defining property, and the reason it needs no mock: no token, no
  // sync, no API. The one thing it does fetch is Google Fonts, a <link> in the
  // head — the rig stubs those two hosts, so what this asserts is that nothing
  // ELSE is contacted. If a call ever appears here it should be a deliberate
  // decision, and this is what forces that conversation.
  const { external, errors } = await bootApp(page)
  for (const tab of TABS) await goTab(page, tab)
  // Back to the garage — the loop ends on settings, which has no cards — and
  // into a detail view, the one screen that draws charts.
  await goTab(page, 'garage')
  await page.locator('.vcard').first().click()
  await page.locator('#app .view').first().waitFor({ state: 'visible' })

  expect(external, `unexpected outbound requests:\n${external.join('\n')}`).toEqual([])
  expect(errors, errors.join('\n')).toEqual([])
})

test('with nothing saved it falls back to the sample cars', async ({ page }) => {
  // First run on a new device. The samples are the whole onboarding — an empty
  // garage here would leave a new user with nothing to look at.
  const { errors } = await bootApp(page, { fresh: true })

  await expect(page.locator('#app')).toContainText('Garage')
  const cards = await page.locator('.vcard').count()
  expect(cards).toBeGreaterThan(1)
  expect(errors, errors.join('\n')).toEqual([])
})

test('corrupt saved state falls back instead of breaking', async ({ page }) => {
  // load() is wrapped in try/catch for a reason: a half-written localStorage
  // value should cost the samples, not the whole app.
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.addInitScript(() => localStorage.setItem('driveline.v1', '{not json'))
  await page.goto('/static/vehicle/index.html')

  await expect(page.locator('#app .view').first()).toBeVisible()
  await expect(page.locator('#app')).toContainText('Garage')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a reload keeps the saved state', async ({ page }) => {
  const { errors } = await bootApp(page)
  await expect(page.locator('#app')).toContainText('Testa Voltage')

  await page.reload()
  await page.locator('#app .view').first().waitFor({ state: 'visible' })

  await expect(page.locator('#app')).toContainText('Testa Voltage')
  await expect(page.locator('#app')).toContainText('3 vehicles')
  expect((await stored(page)).vehicles).toHaveLength(3)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the PWA files are served and parse', async ({ page, request }) => {
  // Service workers are blocked in this rig (see playwright.config.js), so the
  // manifest and worker are checked as files rather than through registration.
  // GAP-W6 made this app installable; that is worth a guard.
  await bootApp(page)

  const manifest = await request.get('/static/vehicle/manifest.webmanifest')
  expect(manifest.ok()).toBeTruthy()
  const m = JSON.parse(await manifest.text())
  expect(m.name).toBeTruthy()
  expect(m.display).toBe('standalone')
  expect(m.icons.length).toBeGreaterThan(0)

  const sw = await request.get('/static/vehicle/sw.js')
  expect(sw.ok()).toBeTruthy()

  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1)
})

test('the phone layout does not scroll sideways', async ({ page }) => {
  // CLAUDE.md is explicit that mobile is designed, not shrunk. This app leans
  // on wide numeric tables, which is exactly where that slips.
  await bootApp(page, { viewport: VIEWPORTS.mobile })
  for (const tab of ['garage', 'compare', 'settings']) {
    await goTab(page, tab)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow, `${tab} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0)
  }
})

test('a vehicle detail view opens and comes back', async ({ page }) => {
  const { errors } = await bootApp(page)

  await page.locator('.vcard').first().click()
  await expect(page.locator('#abTitle')).toHaveText('Testa Voltage')
  await expect(page.locator('#backBtn')).toBeVisible()

  await page.locator('#backBtn').click()
  await expect(page.locator('#abTitle')).toHaveText('Driveline')
  expect(errors, errors.join('\n')).toEqual([])
})
