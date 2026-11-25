const { test, expect } = require('@playwright/test')
const { bootSynced, goTab } = require('./support/boot')

// The other half of the data layer: with a token connected the app reads and
// writes a private GitHub repo through the Contents API. Backed by the shared
// mock (tests/shared/mock-github.js), so no real account and no network.

test('reads the repo instead of the browser store', async ({ page }) => {
  const { errors } = await bootSynced(page)
  await goTab(page, 'active')
  await expect(page.locator('#section-active')).toContainText('Openbank One')
  // The local store was never seeded in this mode — everything on screen came
  // from the repo.
  const local = await page.evaluate(() => localStorage.getItem('bb_local_db/accounts.json'))
  expect(local).toBeNull()
  expect(errors, errors.join('\n')).toEqual([])
})

test('a change is written back to the repo and survives a reload', async ({ page }) => {
  const { errors, mock } = await bootSynced(page)
  await goTab(page, 'planned')
  await page.getByRole('button', { name: 'Mark as opened' }).first().click()

  // Committed, not just redrawn.
  await expect
    .poll(() => {
      const raw = mock.readFile('db/accounts.json')
      if (!raw) return null
      const acct = JSON.parse(raw).find((a) => a.id === 'a_planned_1')
      return acct ? acct.status : null
    })
    .toBe('open')

  // And a fresh load of the app sees it.
  await page.reload()
  await page.locator('.nav-btn[data-tab="today"]').waitFor({ state: 'visible' })
  await goTab(page, 'active')
  await expect(page.locator('#section-active')).toContainText('Planned Provident')
  expect(errors, errors.join('\n')).toEqual([])
})

test('Settings reports the connected repo, not local-only storage', async ({ page }) => {
  await bootSynced(page)
  await goTab(page, 'settings')
  const settings = page.locator('#section-settings')
  await expect(settings).toContainText('testuser/bank-bonus-data')
  await expect(settings).not.toContainText('Saved on this device only')
})

// Issue #18: the daily email is sent by the daily-alert workflow in the data
// repo. Settings has no setup steps, email field or RSS feed any more, just a
// button that runs the workflow once as a test.
test('Settings sends a test of the daily email through the data repo workflow', async ({ page }) => {
  const { errors } = await bootSynced(page)
  const dispatched = []
  await page.route('https://api.github.com/repos/testuser/bank-bonus-data/actions/workflows/daily-alert.yml/dispatches', (route, req) => {
    dispatched.push(JSON.parse(req.postData()))
    return route.fulfill({ status: 204, body: '' })
  })
  await goTab(page, 'settings')
  const card = page.locator('#section-settings .card').filter({ has: page.locator('.card-header', { hasText: 'Daily email' }) }).last()
  await expect(card).toContainText('GitHub emails you a short list')
  await expect(page.locator('#section-settings')).not.toContainText('RSS')
  await expect(page.locator('#set_email')).toHaveCount(0)
  await card.screenshot({ path: require('path').join(__dirname, 'screenshots', 'daily-email.png') })
  await card.getByRole('button', { name: /Send a test email/ }).click()
  await expect(page.locator('.toast')).toContainText('Test email on its way')
  expect(dispatched).toEqual([{ ref: 'main', inputs: { test: 'true' } }])
  expect(errors, errors.join('\n')).toEqual([])
})

test('without sync, Settings says to turn it on for the daily email', async ({ page }) => {
  const { bootApp } = require('./support/boot')
  await bootApp(page)
  await goTab(page, 'settings')
  const settings = page.locator('#section-settings')
  await expect(settings).toContainText('Turn on GitHub sync')
  await expect(settings).not.toContainText('RSS')
})
