const { test, expect } = require('@playwright/test')
const { bootApp } = require('./support/boot')

// S5 Pantry (§12 S5, FR‑23): the household larder. Fixed-height group rows, a
// filter-chip strip, and a drill-in that is a bottom SHEET (overlay) — opening
// it must NEVER move the list behind it (§8.4, the S5 DONE no-reflow gate).

test('pantry groups the fixture items into fixed-height rows', async ({ page }) => {
  const { errors } = await bootApp(page)
  await page.click('nav [data-tab="pantry"]')
  const main = page.locator('#main')
  await expect(page.locator('#pq')).toBeVisible()
  // 6 fixture items → 6 groups (milk, tylenol, bananas, eggs, bread, the evil raw).
  await expect(page.locator('.prow')).toHaveCount(6)
  await expect(main.getByText('Whole milk')).toBeVisible()
  await expect(main.getByText('Tylenol Extra Strength')).toBeVisible()
  // Last price shows in mono; purchase-count sub is present.
  await expect(page.locator('.prow', { hasText: 'Whole milk' }).locator('.pr-price')).toContainText('$')
  expect(errors, errors.join(' | ')).toEqual([])
})

test('filter chips narrow the group list', async ({ page }) => {
  await bootApp(page)
  await page.click('nav [data-tab="pantry"]')
  // HSA chip → only the HSA-eligible group (Tylenol) survives.
  await page.locator('.fchip', { hasText: 'HSA' }).click()
  await expect(page.locator('.prow')).toHaveCount(1)
  await expect(page.locator('.prow')).toContainText('Tylenol')
  // Toggle HSA back off, then Wasted → only the thrown-away banana group.
  await page.locator('.fchip', { hasText: 'HSA' }).click()
  await page.locator('.fchip', { hasText: 'Wasted' }).click()
  await expect(page.locator('.prow')).toHaveCount(1)
  await expect(page.locator('.prow')).toContainText('Bananas')
})

test('typing in the pinned search filters the groups', async ({ page }) => {
  await bootApp(page)
  await page.click('nav [data-tab="pantry"]')
  await page.fill('#pq', 'banana')
  await expect(page.locator('.prow')).toHaveCount(1)
  await expect(page.locator('.prow')).toContainText('Bananas')
})

test('opening a group is a bottom sheet that does NOT reflow the list (§8.4)', async ({ page }) => {
  const { errors } = await bootApp(page)
  await page.click('nav [data-tab="pantry"]')
  const list = page.locator('.plist')
  await expect(list).toBeVisible()
  const before = await list.boundingBox()

  await page.locator('.prow', { hasText: 'Whole milk' }).click()
  const sheet = page.locator('.sheet-card')
  await expect(sheet).toBeVisible()
  // The sheet carries the drill-in content: price-by-store + purchase history.
  await expect(sheet).toContainText('Price by store')
  await expect(sheet).toContainText('Purchase history')

  // The list underneath has not moved — the whole point of the sheet model.
  const after = await list.boundingBox()
  expect(Math.abs(after.x - before.x), 'list shifted x').toBeLessThanOrEqual(1)
  expect(Math.abs(after.y - before.y), 'list shifted y').toBeLessThanOrEqual(1)
  expect(Math.abs(after.width - before.width), 'list resized').toBeLessThanOrEqual(1)
  expect(errors, errors.join(' | ')).toEqual([])
})

test('waste from the sheet commits once and refreshes in place', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await page.click('nav [data-tab="pantry"]')
  await page.fill('#pq', 'milk')
  const list = page.locator('.plist')
  const before = await list.boundingBox()

  await page.locator('.prow').first().click()
  await page.locator('.sheet-card [data-action="pantryWaste"]').first().click()
  await page.locator('.modal-card [data-mval="spoiled"]').click()
  await expect(page.locator('.toast')).toContainText('waste')

  // Single atomic commit; the sheet stays open and now shows the item wasted.
  expect(mock.commits.length).toBe(1)
  await expect(page.locator('.sheet-card')).toContainText('wasted')
  // The list never jumped while the sheet mutated.
  const after = await list.boundingBox()
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1)
  expect(errors, errors.join(' | ')).toEqual([])
})
