const { test, expect } = require('@playwright/test')
const { bootApp, goTab, VIEWPORTS } = require('./support/boot')

// GAP-W2 class 4: a screenshot pass at the three widths CLAUDE.md names —
// 390 (phone), 900 (tablet), 1300 (desktop). These are attached to the report
// so a layout change is reviewable, and each one also asserts the two things
// that are cheap to check and expensive to miss: nothing overflows the page
// sideways, and the console stayed clean at that width.

const TABS = ['today', 'active', 'planned', 'offers', 'calendar', 'reports', 'settings']

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`${name} (${viewport.width}px): every tab renders without sideways overflow`, async ({
    page,
  }, testInfo) => {
    const { errors } = await bootApp(page, { viewport })
    for (const tab of TABS) {
      await goTab(page, tab)
      // Let any width-dependent render settle before measuring or shooting.
      await page.waitForTimeout(120)

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))
      // A page that scrolls sideways is a layout bug on a phone. Wide content
      // (the reports table) is expected to scroll inside its own container.
      expect(
        overflow.scrollWidth,
        `${tab} at ${viewport.width}px scrolls sideways (${overflow.scrollWidth} > ${overflow.innerWidth})`
      ).toBeLessThanOrEqual(overflow.innerWidth + 1)

      await testInfo.attach(`${name}-${tab}.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    }
    expect(errors, errors.join('\n')).toEqual([])
  })
}
