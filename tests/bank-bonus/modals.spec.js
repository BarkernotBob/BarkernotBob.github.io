const { test, expect } = require('@playwright/test')
const { bootApp, goTab } = require('./support/boot')

// Regression cover for the bug this suite found on its first run.
//
// modal() used to remove the overlay from the DOM and only then resolve its
// promise. Every caller that collects input reads its fields on the line after
// `await modal(...)` — so `$('#na_inst').value` was read off null, threw, and
// created nothing. "+ Add Account" and "+ Add Offer", the two ways to enter
// anything by hand, both did nothing at all, silently.
//
// The fix keeps the overlay attached until the caller has resumed. These tests
// pin both halves: the fields must still be readable when the promise settles,
// and the overlay must still be gone afterwards — a modal that lingers would
// swallow every click on the page behind it.

test('a modal that collects input can still be read when it resolves', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'active')

  await page.getByRole('button', { name: '+ Add Account' }).first().click()
  await page.locator('.modal-ov #na_inst').fill('Readback Bank')
  await page.locator('.modal-ov button[data-mval="save"]').click()

  await expect
    .poll(async () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('bb_local_db/accounts.json') || '[]').some(
          (a) => a.institution === 'Readback Bank'
        )
      )
    )
    .toBe(true)
  // The old failure mode was a TypeError on a detached node, so a clean console
  // is part of the assertion, not decoration.
  expect(errors, errors.join('\n')).toEqual([])
})

for (const [how, close] of [
  ['the cancel button', async (page) => page.locator('.modal-ov [data-mcancel]').click()],
  ['a confirming button', async (page) => page.locator('.modal-ov [data-mval]').first().click()],
  ['the Escape key', async (page) => page.keyboard.press('Escape')],
  ['a click outside the card', async (page) => page.mouse.click(5, 5)],
]) {
  test(`closing with ${how} leaves no overlay behind`, async ({ page }) => {
    const { errors } = await bootApp(page)
    await goTab(page, 'offers')

    await page.getByRole('button', { name: '+ Add Offer' }).first().click()
    await expect(page.locator('.modal-ov')).toBeVisible()
    await close(page)

    await expect(page.locator('.modal-ov')).toHaveCount(0)
    // And the page underneath is genuinely usable again — an invisible overlay
    // still catching clicks would pass a "not visible" check and fail this one.
    await goTab(page, 'active')
    await expect(page.locator('#section-active')).toContainText('Openbank One')
    expect(errors, errors.join('\n')).toEqual([])
  })
}

test('two modals in a row: the second opens with its own empty fields', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'offers')

  await page.getByRole('button', { name: '+ Add Offer' }).first().click()
  await page.locator('.modal-ov #off_inst').fill('First Offer Bank')
  await page.locator('.modal-ov button[data-mval]').first().click()

  await page.getByRole('button', { name: '+ Add Offer' }).first().click()
  await expect(page.locator('.modal-ov')).toHaveCount(1)
  await expect(page.locator('.modal-ov #off_inst')).toHaveValue('')
  expect(errors, errors.join('\n')).toEqual([])
})
