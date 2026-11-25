const { test, expect } = require('@playwright/test')
const { bootSynced, bootApp, goTab, fixture } = require('./support/boot')

// Issue #17: actions that change more than one file (promote an offer, move an
// account back to Offers, import a backup) land as ONE commit or not at all, so
// a failure can never leave an account made while its offer stays in the
// backlog (which invites opening it twice).

const ACCOUNTS = 'db/accounts.json'
const OFFERS = 'db/offers.json'
const OFFER_ID = 'seed_test_01'
const OFFER_NAME = 'Fixture Federal Credit Union'
const strict = { strictContentsSha: true }
const remote = (mock, p) => JSON.parse(mock.readFile(p))
const promotedRemotely = (mock) => remote(mock, ACCOUNTS).filter((a) => a.offerId === OFFER_ID).length

async function promote(page) {
  await goTab(page, 'offers')
  await page.locator('#section-offers .card', { hasText: OFFER_NAME })
    .getByRole('button', { name: 'Move to Planned' }).click()
  await page.locator('.modal-ov').getByRole('button', { name: 'Sam', exact: true }).click()
}

test('promoting an offer writes the account and the archived offer in one commit', async ({ page }) => {
  const { errors, mock } = await bootSynced(page, { mock: strict })
  const commitsBefore = mock.commits.length
  await promote(page)
  await expect.poll(() => promotedRemotely(mock)).toBe(1)
  expect(remote(mock, OFFERS).find((o) => o.id === OFFER_ID).status).toBe('archived')
  expect(mock.commits.length - commitsBefore).toBe(1)
  expect(mock.refUpdates).toBe(1)
  expect(errors, errors.join('\n')).toEqual([])
})

test('if the commit fails, neither file changes and the screen shows what is saved', async ({ page }) => {
  const { mock } = await bootSynced(page, { mock: strict })
  const accountsBefore = mock.readFile(ACCOUNTS)
  const offersBefore = mock.readFile(OFFERS)
  // The next move of main fails outright (routes added later take precedence).
  let failed = false
  await page.route('https://api.github.com/repos/*/*/git/refs/heads/main', (route) => {
    if (failed || route.request().method() !== 'PATCH') return route.fallback()
    failed = true
    return route.fulfill({ status: 500, json: { message: 'Server Error' } })
  })
  await promote(page)
  await expect(page.locator('.toast')).toContainText("Couldn't save")
  expect(mock.readFile(ACCOUNTS)).toBe(accountsBefore)
  expect(mock.readFile(OFFERS)).toBe(offersBefore)
  // Undone on screen too: the offer is back in the backlog, no new planned account.
  await expect(page.locator('#section-offers .card', { hasText: OFFER_NAME })
    .getByRole('button', { name: 'Move to Planned' })).toBeVisible()
  await goTab(page, 'planned')
  await expect(page.locator('#section-planned')).not.toContainText(OFFER_NAME)

  // Trying again after the failure works and lands once.
  await promote(page)
  await expect.poll(() => promotedRemotely(mock)).toBe(1)
})

test('a lost reply on a commit that landed counts as saved, once', async ({ page }) => {
  const { mock } = await bootSynced(page, { mock: strict })
  mock.armLostResponse()
  await promote(page)
  await expect.poll(() => promotedRemotely(mock)).toBe(1)
  await expect(page.locator('.toast', { hasText: /couldn't/i })).toHaveCount(0)
  expect(mock.refUpdates).toBe(1)
})

test('a commit racing another device is retried and keeps both changes', async ({ page }) => {
  const { mock } = await bootSynced(page, { mock: strict })
  // Another device edits a different offer just as this commit lands.
  const other = JSON.parse(fixture('offers.json'))
  const elsewhere = other.find((o) => o.id !== OFFER_ID)
  elsewhere.notes = 'Edited on another device'
  mock.armRaceInject({ [OFFERS]: JSON.stringify(other, null, 2) })
  await promote(page)
  await expect.poll(() => promotedRemotely(mock)).toBe(1)
  const offers = remote(mock, OFFERS)
  expect(offers.find((o) => o.id === OFFER_ID).status).toBe('archived')
  expect(offers.find((o) => o.id === elsewhere.id).notes).toBe('Edited on another device')
  await expect(page.locator('.toast', { hasText: /couldn't|another device/i })).toHaveCount(0)
})

test('after a batch, a single save to the same file still uses the right version', async ({ page }) => {
  const { mock } = await bootSynced(page, { mock: strict })
  await promote(page)
  await expect.poll(() => promotedRemotely(mock)).toBe(1)
  // Deleting the other offer is a plain one-file save; a stale version would 409.
  await page.locator('#section-offers .card', { hasText: 'Testbank & Trust' })
    .getByRole('button', { name: 'Delete' }).click()
  await page.locator('.modal-ov').getByRole('button', { name: 'Delete' }).click()
  await expect.poll(() => remote(mock, OFFERS).some((o) => o.id === 'seed_test_02')).toBe(false)
  expect(remote(mock, OFFERS).find((o) => o.id === OFFER_ID).status).toBe('archived')
  await expect(page.locator('.toast', { hasText: /couldn't|another device/i })).toHaveCount(0)
})

test('local mode: moving an account back to Offers saves both files', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'planned')
  await page.locator('#section-planned').getByText('Planned Provident').first().click()
  await page.getByRole('button', { name: 'Move to Offers' }).click()
  await page.locator('.modal-ov').getByRole('button', { name: 'Move to Offers' }).click()
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('bb_local_db/accounts.json')).some((a) => a.id === 'a_planned_1'))).toBe(false)
  const offers = await page.evaluate(() => JSON.parse(localStorage.getItem('bb_local_db/offers.json')))
  expect(offers.some((o) => o.institution === 'Planned Provident' && o.status === 'backlog')).toBe(true)
  expect(errors, errors.join('\n')).toEqual([])
})
