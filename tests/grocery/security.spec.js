const { test, expect } = require('@playwright/test')
const { bootApp } = require('./support/boot')

// The two S0 prereq fixes, locked in:
//   1. esc() escapes single quotes, and
//   2. zero inline on* handlers (event delegation instead).
// Together these close the audited HTML-injection class. Fixtures include an item
// whose rawName/id carry <img onerror>, quotes and angle brackets.

test('no inline on* handlers exist in any rendered view', async ({ page }) => {
  await bootApp(page)
  const tabs = ['capture', 'pantry', 'trips', 'reports', 'review', 'table', 'settings']
  for (const tab of tabs) {
    await page.click(`nav [data-tab="${tab}"]`)
    await page.waitForTimeout(50)
    const count = await page.locator('[onclick], [oninput], [onchange]').count()
    expect(count, `inline handler found on ${tab}`).toBe(0)
  }
})

test('malicious item name is escaped, not executed (pantry sheet)', async ({ page }) => {
  await bootApp(page)
  await page.click('nav [data-tab="pantry"]')
  await page.fill('#pq', 'Evil')
  // Open the group sheet, which shows the raw (payload-bearing) name.
  await page.locator('.prow').first().click()
  await expect(page.locator('.sheet-card')).toBeVisible()

  // The onerror payload must never have fired.
  const xss = await page.evaluate(() => window.__xss)
  expect(xss).toBeUndefined()

  // No stray <img> injected from the payload string.
  const imgs = await page.locator('.sheet-card img').count()
  expect(imgs).toBe(0)

  // The payload text renders literally (escaped, so it's inert text).
  await expect(page.locator('.sheet-card')).toContainText('onerror=window.__xss=1')
})

test('waste action on a quote-laden id resolves to the right item', async ({ page }) => {
  const { mock } = await bootApp(page)
  await page.click('nav [data-tab="pantry"]')
  await page.fill('#pq', 'Evil')
  // Open the group sheet, then click the purchase's Waste button.
  await page.locator('.prow').first().click()
  await page.locator('.sheet-card [data-action="pantryWaste"]').first().click()
  // Waste reason modal appears (data-action delegation reached pantryWaste,
  // decoding the quote-laden id from data-id correctly).
  await expect(page.locator('.modal-card', { hasText: 'Throw away' })).toBeVisible()
  await page.locator('.modal-card [data-mval="spoiled"]').click()
  // A write happened (item + waste + reminders in ONE commit); UI updated cleanly.
  await expect(page.locator('.toast')).toContainText('waste')
  expect(mock.commits.length).toBeGreaterThan(0)
  // The RIGHT item (the quote-laden one) was marked, not some other.
  const items = JSON.parse(mock.readFile('db/items.json'))
  expect(items.find((i) => i.id === `i_e'"vil_0004`).status).toBe('thrown_away')
})
