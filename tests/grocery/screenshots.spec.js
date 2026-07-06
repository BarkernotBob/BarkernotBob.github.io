const { test, expect } = require('@playwright/test')
const { bootApp, VIEWPORTS } = require('./support/boot')

// The visual-verification record (C‑10 / §13 class 7): every view at every
// viewport, in BOTH themes (light + dark, S3 design system), saved to
// screenshots/ and uploaded as a CI artifact for review.

const VIEWS = ['today', 'capture', 'pantry', 'trips', 'reports', 'review', 'table', 'settings']
const THEMES = ['light', 'dark']

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  for (const theme of THEMES) {
    test.describe(`screenshots @ ${vpName} · ${theme}`, () => {
      for (const view of VIEWS) {
        test(`${view}`, async ({ page }) => {
          await bootApp(page, { viewport })
          await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
          await page.click(`nav [data-tab="${view}"]`)
          // Let the view settle (data already mocked, so this is quick).
          await page.waitForTimeout(150)
          await page.screenshot({
            path: `screenshots/${view}-${vpName}-${theme}.png`,
            fullPage: true,
          })
          expect(true).toBe(true)
        })
      }
    })
  }
}
