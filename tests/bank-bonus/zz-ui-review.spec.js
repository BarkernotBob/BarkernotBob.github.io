// TEMP: UI review screenshots (wish-list #4). Removed before merge.
const { test } = require('@playwright/test')
const path = require('path')
const { bootApp, goTab, VIEWPORTS } = require('./support/boot')
const TABS = ['today', 'active', 'planned', 'offers', 'calendar', 'reports', 'settings']
for (const vp of ['mobile', 'desktop']) {
  test(`ui review ${vp}`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-26T17:00:00Z'))
    await bootApp(page, { viewport: VIEWPORTS[vp] })
    for (const tab of TABS) {
      await goTab(page, tab)
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(__dirname, 'screenshots', `ui-${vp}-${tab}.png`), fullPage: true, type: 'jpeg', quality: 60 })
    }
  })
}
