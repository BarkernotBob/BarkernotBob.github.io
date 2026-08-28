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
