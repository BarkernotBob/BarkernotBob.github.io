const { test, expect } = require('@playwright/test')
const { bootApp, VIEWPORTS } = require('./support/boot')

// The visual-verification record (C‑10 / §13 class 7): every view at every
// viewport, saved to screenshots/ and uploaded as a CI artifact for review.
// Dark theme joins this matrix with the design system (S3).

const VIEWS = ['capture', 'search', 'reports', 'review', 'table', 'settings']

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  test.describe(`screenshots @ ${vpName}`, () => {
    for (const view of VIEWS) {
      test(`${view}`, async ({ page }) => {
        await bootApp(page, { viewport })
        await page.click(`nav [data-tab="${view}"]`)
        // Let the view settle (data already mocked, so this is quick).
        await page.waitForTimeout(150)
        await page.screenshot({
          path: `screenshots/${view}-${vpName}.png`,
          fullPage: true,
        })
        expect(true).toBe(true)
      })
    }
  })
}
