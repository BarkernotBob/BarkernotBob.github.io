const { test, expect } = require('@playwright/test')
const { bootApp } = require('./support/boot')

// Core interactions against the mock (§13 class 5) plus a mechanical no-reflow
// check on the table (§13 class 2) where the guarantee genuinely holds today.

test('table sorts on header click without moving the header/filter row', async ({ page }) => {
  await bootApp(page)
  await page.click('nav [data-tab="table"]')
  await expect(page.locator('#ttable')).toBeVisible()

  const filterInput = page.locator('#ttable input[data-f="name"]')
  const before = await filterInput.boundingBox()

  // Sort by Name ascending, capture first cell, reverse, expect it to change.
  await page.click('#ttable th[data-action="sortTable"][data-col="name"]')
  const firstAsc = await page.locator('#tbody tr td').first().textContent()
  await page.click('#ttable th[data-action="sortTable"][data-col="name"]')
  const firstDesc = await page.locator('#tbody tr td').first().textContent()
  expect(firstAsc).not.toBe(firstDesc)

  // The controls above the body must not have moved (no-reflow).
  const after = await filterInput.boundingBox()
  expect(after).toEqual(before)
})

test('table column filter narrows rows', async ({ page }) => {
  await bootApp(page)
  await page.click('nav [data-tab="table"]')
  await page.fill('#ttable input[data-f="name"]', 'Bananas')
  await expect(page.locator('#tbody tr')).toHaveCount(1)
  await expect(page.locator('#tcount')).toContainText('1 of 4')
})

test('reports total updates when the date range changes', async ({ page }) => {
  await bootApp(page)
  await page.click('nav [data-tab="reports"]')
  await expect(page.locator('#rf')).toBeVisible()
  // Widen the range to cover all fixture purchases (2026-06-20 .. 2026-06-30).
  await page.fill('#rf', '2026-01-01')
  await page.fill('#rt', '2026-12-31')
  await page.locator('#rf').dispatchEvent('change')
  await expect(page.locator('#rout .big').first()).toContainText('$')
  await expect(page.locator('#rout')).toContainText('Publix')
})

test('resolving a review flag removes it from the list', async ({ page }) => {
  await bootApp(page)
  await page.click('nav [data-tab="review"]')
  await expect(page.locator('#flag_na_0001')).toBeVisible()
  await page.fill('#fix_na_0001', '3.49')
  await page.locator('[data-action="resolveFlag"][data-id="na_0001"]').first().click()
  await expect(page.locator('#flag_na_0001')).toHaveCount(0)
})

test('reminder "still good" closes the reminder', async ({ page }) => {
  await bootApp(page)
  await page.click('nav [data-tab="review"]')
  const stillGood = page.locator('[data-action="remAction"][data-remaction="kept"]').first()
  await expect(stillGood).toBeVisible()
  await stillGood.click()
  await expect(page.locator('.toast')).toContainText('Updated')
})
