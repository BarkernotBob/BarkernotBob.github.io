const { test, expect } = require('@playwright/test')
const { bootApp, goTab } = require('./support/boot')

// UI review (wish-list #4).

test('a hovered or pressed tab keeps a clear background', async ({ page }) => {
  await bootApp(page, { viewport: { width: 1300, height: 900 } })
  const tab = page.locator('nav button[data-tab="calendar"]')
  await tab.hover()
  expect(await tab.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
})

test('on a phone, offer buttons sit two to a row', async ({ page }) => {
  await bootApp(page)
  await goTab(page, 'offers')
  const card = page.locator('#section-offers .card', { hasText: 'Testbank & Trust' })
  const box = async (name) => card.getByRole('button', { name, exact: true }).boundingBox()
  const [planned, open, edit, del] = await Promise.all(['Move to Planned', 'Open now', 'Edit', 'Delete'].map(box))
  expect(Math.round(planned.y)).toBe(Math.round(open.y))
  expect(Math.round(edit.y)).toBe(Math.round(del.y))
  expect(edit.y).toBeGreaterThan(planned.y)
})

test('on a phone, an odd button out takes the whole first row', async ({ page }) => {
  await bootApp(page, { seed: { 'bb_local_db/accounts.json': '[]' } })
  await goTab(page, 'settings')
  // Export and Import share a row; the hidden file input doesn't count.
  const exp = await page.getByRole('button', { name: /Export backup/ }).boundingBox()
  const imp = await page.getByRole('button', { name: /Import backup/ }).boundingBox()
  expect(Math.round(exp.y)).toBe(Math.round(imp.y))
})
