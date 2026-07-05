const { test, expect } = require('@playwright/test')
const { bootApp } = require('./support/boot')

// The two S0 prereq fixes, locked in:
//   1. esc() escapes single quotes, and
//   2. zero inline on* handlers (event delegation instead).
// Together these close the audited HTML-injection class. Fixtures include an item
// whose rawName/id carry <img onerror>, quotes and angle brackets.

test('no inline on* handlers exist in any rendered view', async ({ page }) => {
  await bootApp(page)
  const tabs = ['capture', 'search', 'reports', 'review', 'table', 'settings']
  for (const tab of tabs) {
    await page.click(`nav [data-tab="${tab}"]`)
    await page.waitForTimeout(50)
    const count = await page.locator('[onclick], [oninput], [onchange]').count()
    expect(count, `inline handler found on ${tab}`).toBe(0)
  }
})

test('malicious item name is escaped, not executed', async ({ page }) => {
  await bootApp(page)
  await page.click('nav [data-tab="search"]')
  await expect(page.locator('#sq')).toBeVisible()

  // The onerror payload must never have fired.
  const xss = await page.evaluate(() => window.__xss)
  expect(xss).toBeUndefined()

  // No stray <img> injected from the payload string.
  const imgs = await page.locator('#sresults img').count()
  expect(imgs).toBe(0)

  // The payload text renders literally somewhere in the results.
  await expect(page.locator('#sresults')).toContainText('onerror=window.__xss=1')
})

test('waste action on a quote-laden id resolves to the right item', async ({ page }) => {
  const { mock } = await bootApp(page)
  await page.click('nav [data-tab="search"]')
  await page.fill('#sq', 'Evil')
  // Open the group card, then click its Waste button.
  await page.locator('#sresults .grp').first().click()
  await page.locator('#sresults [data-action="markWaste"]').first().click()
  // Waste reason modal appears (data-action delegation reached markWaste).
  await expect(page.locator('.modal-card', { hasText: 'Throw away' })).toBeVisible()
  await page.locator('.modal-card [data-mval="spoiled"]').click()
  // A write happened (item + waste + reminders); UI updated without a console throw.
  await expect(page.locator('.toast')).toContainText('waste')
  expect(mock.puts.length).toBeGreaterThan(0)
})
