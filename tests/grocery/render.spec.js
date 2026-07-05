const { test, expect } = require('@playwright/test')
const { bootApp } = require('./support/boot')

// One render assertion per view: the tab loads its content from the mocked db
// with a clean console (§13 assertion class 1). If a selector the view depends
// on regresses, or the data layer throws, these go red — the S0 "broken selector
// fails CI" guarantee.

const VIEWS = [
  { tab: 'today', ready: '#todayView', assert: 'text=This week' },
  { tab: 'capture', ready: 'text=Snap a receipt', assert: 'text=Recent captures' },
  { tab: 'search', ready: '#sq', assert: 'text=Search items' },
  { tab: 'reports', ready: '#rf', assert: 'text=Spend per store' },
  { tab: 'review', ready: 'text=Needs attention', assert: 'text=Freshness reminders' },
  { tab: 'table', ready: '#ttable', assert: 'text=All items' },
  { tab: 'settings', ready: 'text=This device', assert: 'text=How this works' },
]

test.describe('render every view', () => {
  for (const v of VIEWS) {
    test(`${v.tab} renders from the mocked db, clean console`, async ({ page }) => {
      const { errors } = await bootApp(page)
      await page.click(`nav [data-tab="${v.tab}"]`)
      await expect(page.locator(v.ready).first()).toBeVisible()
      await expect(page.locator(v.assert).first()).toBeVisible()
      expect(errors, `console errors on ${v.tab}: ${errors.join(' | ')}`).toEqual([])
    })
  }
})

test('boot lands on Today and marks the nav tab active', async ({ page }) => {
  await bootApp(page)
  await expect(page.locator('#todayView')).toBeVisible()
  await expect(page.locator('nav [data-tab="today"]')).toHaveClass(/active/)
})

test('review badge reflects open flags + due reminders', async ({ page }) => {
  await bootApp(page)
  // Fixtures: 1 open needs_attention + 1 overdue reminder = badge "2".
  const badge = page.locator('#reviewBadge')
  await expect(badge).toBeVisible()
  await expect(badge).toHaveText('2')
})
