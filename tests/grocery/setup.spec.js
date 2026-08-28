const path = require('path')
const { test, expect } = require('@playwright/test')
const { installGitHubMock } = require('../shared/mock-github')
const { APP_URL } = require('./support/boot')

// GAP-W3 (#113). Every other spec boots already-configured, so the setup screen —
// the one screen every new device sees — had no cover at all. It now recommends a
// fine-grained token scoped to the single data repo, with the broad one-tap OAuth
// button demoted to a collapsed fallback, and these pin that.

// Boot with NOTHING in localStorage, so the app renders its setup screen.
async function bootUnconfigured(page) {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  const mock = await installGitHubMock(page, {
    fixturesDir: path.join(__dirname, 'fixtures', 'db'),
    seedImages: ['receipts/r_pub_0001.jpg', 'inbox/r_pub_0002.jpg'],
  })
  await page.goto(APP_URL)
  await expect(page.locator('#su_token')).toBeVisible()
  return { errors, mock }
}

test('the setup screen leads with the scoped-token fields, not the broad sign-in', async ({ page }) => {
  const { errors } = await bootUnconfigured(page)

  // The token form is the primary path: visible without opening anything.
  await expect(page.locator('#su_repo')).toBeVisible()
  await expect(page.locator('#su_token')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible()

  // And it says, on screen, to scope the key to just this repo.
  const card = page.locator('#main')
  await expect(card).toContainText('only')
  await expect(card).toContainText('grocery-data')
  await expect(card).toContainText('tokens?type=beta')

  expect(errors, errors.join('\n')).toEqual([])
})

test('the broad "Sign in with GitHub" route is collapsed and says what it asks for', async ({ page }) => {
  await bootUnconfigured(page)

  const details = page.locator('#main details')
  await expect(details).toHaveCount(1)
  await expect(details).toContainText('Other way in')
  // Collapsed by default — it must not be the obvious thing to tap.
  expect(await details.evaluate((d) => d.open)).toBe(false)

  // The scope it really asks for is stated before you can reach the button, not
  // buried in a guide. This is the whole point of GAP-W3.
  await expect(details).toContainText('every')
  await expect(details).toContainText('private repositor')

  await details.locator('summary').click()
  await expect(page.getByRole('button', { name: /Sign in with GitHub/ })).toBeVisible()
})

test('connecting with a scoped token still works end to end', async ({ page }) => {
  // The fields moved out of a <details> and the button was renamed, so prove the
  // flow the docs now recommend actually connects.
  const { errors } = await bootUnconfigured(page)

  await page.locator('#su_me').selectOption('Me')
  await page.locator('#su_device').fill('Test Phone')
  await page.locator('#su_repo').fill('testuser/grocery-data')
  await page.locator('#su_token').fill('github_pat_test')
  await page.getByRole('button', { name: 'Connect', exact: true }).click()

  // Lands in the app proper, and remembered the connection.
  await expect(page.locator('nav [data-tab="today"]')).toBeVisible({ timeout: 15000 })
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('gt_repo')))
    .toBe('testuser/grocery-data')
  expect(await page.evaluate(() => localStorage.getItem('gt_method'))).toBe('token')
  expect(errors, errors.join('\n')).toEqual([])
})

test('an already-connected device is never sent back to setup', async ({ page }) => {
  // The acceptance criterion that mattered most: this change must not force
  // anyone — on either route — to set up again.
  for (const method of ['token', 'oauth']) {
    await page.addInitScript((m) => {
      localStorage.setItem('gt_repo', 'testuser/grocery-data')
      localStorage.setItem('gt_token', 'ghp_existing')
      localStorage.setItem('gt_me', 'Me')
      localStorage.setItem('gt_device', 'Old Phone')
      localStorage.setItem('gt_method', m)
    }, method)
    await installGitHubMock(page, {
      fixturesDir: path.join(__dirname, 'fixtures', 'db'),
      seedImages: ['receipts/r_pub_0001.jpg', 'inbox/r_pub_0002.jpg'],
    })
    await page.goto(APP_URL)
    await expect(page.locator('nav [data-tab="today"]')).toBeVisible({ timeout: 15000 })
    expect(await page.locator('#su_token').count(), `${method} was sent back to setup`).toBe(0)
  }
})
