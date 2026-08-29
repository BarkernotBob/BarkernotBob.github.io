const { test, expect } = require('@playwright/test')
const { bootApp, goTab } = require('./support/boot')

// The dialog contract.
//
// This file exists because of a bug this suite found on its first run: modal()
// detached its overlay and only THEN resolved its promise, so any caller that
// read a form field after `await modal(...)` read it off null. In pool that was
// editChecklist() — editing the Spring opening or Fall closing checklist threw
// "Cannot read properties of null (reading 'value')" and saved nothing, with no
// error shown. bank-bonus shipped the identical bug in two flows (#119).
//
// Most of pool's other callers had already worked around it by capturing values
// through input listeners while the dialog was open, which is why the bug hid:
// six callers dodged it, one didn't. The fix is in modal() itself, so the rule
// below holds for every caller, including ones not written yet.

// The overlay lingers one macrotask after resolving (hidden, non-interactive)
// so callers can still read their fields. "Closed" therefore means gone or
// invisible, not merely still in the DOM.
async function expectClosed(page) {
  await expect.poll(async () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.modal-ov')].filter(
        (o) => o.style.visibility !== 'hidden'
      ).length
    )
  ).toBe(0)
}

test('a dialog can still read its fields once the promise resolves', async ({ page }) => {
  // The regression test for the bug above, at its narrowest: type into the
  // checklist textarea, save, and require the typed text to have been read.
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'schedule')

  const card = page.locator('.card').filter({ hasText: 'Spring opening' })
  await card.getByRole('button', { name: 'Edit' }).click()

  const dialog = page.locator('.modal-ov')
  await expect(dialog).toBeVisible()
  await dialog.locator('#cl_steps').fill('Uncover the pool\nRun the pump\nTest the water')
  await dialog.getByRole('button', { name: 'Save' }).click()

  await expect
    .poll(async () => JSON.parse(mock.readFile('db/config.json')).opening.steps)
    .toEqual(['Uncover the pool', 'Run the pump', 'Test the water'])

  // Before the fix this threw instead, which is what made the failure silent.
  expect(errors, errors.join('\n')).toEqual([])
  await expect(card).toContainText('Uncover the pool')
})

test('the closing checklist edits too', async ({ page }) => {
  // Same code path, other argument — cheap, and it catches a fix applied to
  // only one of the two cards.
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'schedule')

  const card = page.locator('.card').filter({ hasText: 'Fall closing' })
  await card.getByRole('button', { name: 'Edit' }).click()
  await page.locator('.modal-ov #cl_steps').fill('Cover it up')
  await page.locator('.modal-ov').getByRole('button', { name: 'Save' }).click()

  await expect
    .poll(async () => JSON.parse(mock.readFile('db/config.json')).closing.steps)
    .toEqual(['Cover it up'])
  expect(errors, errors.join('\n')).toEqual([])
})

test('cancelling a dialog changes nothing', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  const before = mock.readFile('db/config.json')
  await goTab(page, 'schedule')

  const card = page.locator('.card').filter({ hasText: 'Spring opening' })
  await card.getByRole('button', { name: 'Edit' }).click()
  await page.locator('.modal-ov #cl_steps').fill('This should never be saved')
  await page.locator('.modal-ov').getByRole('button', { name: 'Cancel' }).click()

  await expectClosed(page)
  expect(mock.readFile('db/config.json')).toBe(before)
  expect(errors, errors.join('\n')).toEqual([])
})

test('clicking the backdrop cancels', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  const before = mock.readFile('db/swim.json')

  await page.getByRole('button', { name: 'Log swim time' }).click()
  await expect(page.locator('.modal-ov')).toBeVisible()
  // Click the overlay itself, away from the card.
  await page.locator('.modal-ov').click({ position: { x: 5, y: 5 } })

  await expectClosed(page)
  expect(mock.readFile('db/swim.json')).toBe(before)
  expect(errors, errors.join('\n')).toEqual([])
})

test('no overlay is left behind on any close path', async ({ page }) => {
  // A stale overlay swallows every subsequent tap — the app looks frozen. Walk
  // the three ways a dialog ends and require a clean screen after each.
  const { errors } = await bootApp(page)

  // 1. Cancel.
  await page.getByRole('button', { name: 'Log swim time' }).click()
  await page.locator('.modal-ov').getByRole('button', { name: 'Cancel' }).click()
  await expectClosed(page)

  // 2. Backdrop.
  await page.getByRole('button', { name: 'Log swim time' }).click()
  await page.locator('.modal-ov').click({ position: { x: 5, y: 5 } })
  await expectClosed(page)

  // 3. Save.
  await page.getByRole('button', { name: 'Log swim time' }).click()
  await page.locator('.modal-ov #sw_hrs').fill('0.5')
  await page.locator('.modal-ov').getByRole('button', { name: 'Save' }).click()
  await expectClosed(page)

  // And the app is still usable afterwards — the point of all three.
  await goTab(page, 'schedule')
  await expect(page.locator('#main')).toContainText('Routine')
  expect(errors, errors.join('\n')).toEqual([])
})

test('declining the sign-out confirm keeps you signed in', async ({ page }) => {
  // confirmModal() is the destructive-confirm path, and sign-out is its only
  // caller. Declining must be a true no-op: the token has to survive, or the
  // person is locked out of their own data by a misclick.
  const { errors } = await bootApp(page)
  await goTab(page, 'settings')

  await page.getByRole('button', { name: /Sign out/i }).first().click()
  const dialog = page.locator('.modal-ov')
  await expect(dialog).toContainText('Sign out on this device?')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expectClosed(page)

  expect(await page.evaluate(() => localStorage.getItem('pl_token'))).toBe('ghp_test_token')
  await expect(page.locator('#whoami')).toContainText('testuser')
  expect(errors, errors.join('\n')).toEqual([])
})

test('confirming sign-out clears the token but not the repo', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'settings')

  await page.getByRole('button', { name: /Sign out/i }).first().click()
  await page.locator('.modal-ov').getByRole('button', { name: 'Sign out' }).click()
  await expectClosed(page)

  await expect.poll(async () => page.evaluate(() => localStorage.getItem('pl_token'))).toBe(null)
  expect(await page.evaluate(() => localStorage.getItem('pl_login'))).toBe(null)
  // The repo name is deliberately kept — signing back in should not mean
  // typing it again.
  expect(await page.evaluate(() => localStorage.getItem('pl_repo'))).toBe('testuser/pool-data')
  await expect(page.locator('#main')).toContainText('Connect')
  expect(errors, errors.join('\n')).toEqual([])
})

test('deleting an AI insight rule removes it', async ({ page }) => {
  // The insight list is the one delete with no confirm in front of it, so the
  // click has to do exactly one thing and do it completely.
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'settings')

  const row = page.locator('.item').filter({ hasText: 'Heavy rain dilutes the chlorine' })
  await row.getByRole('button', { name: 'delete' }).click()

  await expect.poll(async () => JSON.parse(mock.readFile('db/config.json')).insights).toEqual([])
  await expect(
    page.locator('.item').filter({ hasText: 'Heavy rain dilutes the chlorine' })
  ).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the dialog fits a phone screen', async ({ page }) => {
  // CLAUDE.md: mobile is designed, not shrunk. A dialog wider than the viewport
  // puts its Save button off-screen, which is unrecoverable on a phone.
  const { VIEWPORTS, errors } = await bootApp(page)
  await page.setViewportSize(VIEWPORTS.mobile)

  await page.getByRole('button', { name: 'Log swim time' }).click()
  const card = page.locator('.modal-ov .modal-card')
  await expect(card).toBeVisible()

  const box = await card.boundingBox()
  expect(box.width).toBeLessThanOrEqual(VIEWPORTS.mobile.width)
  expect(box.x).toBeGreaterThanOrEqual(0)
  await expect(page.locator('.modal-ov').getByRole('button', { name: 'Save' })).toBeInViewport()
  expect(errors, errors.join('\n')).toEqual([])
})
