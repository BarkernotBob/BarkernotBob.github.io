const { test, expect } = require('@playwright/test')
const { bootApp, goTab, VIEWPORTS } = require('./support/boot')

// GAP-W2 class 4: a screenshot pass at the three widths CLAUDE.md names —
// 390 (phone), 900 (tablet), 1300 (desktop). These are attached to the report
// so a layout change is reviewable, and each one also asserts the two things
// that are cheap to check and expensive to miss: nothing overflows the page
// sideways, and the console stayed clean at that width.
//
// This app is the one most at risk of it: its whole content is wide numeric
// tables and charts.

const TABS = ['garage', 'compare', 'settings']

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`${name} (${viewport.width}px): every view renders without sideways overflow`, async ({
    page,
  }, testInfo) => {
    const { errors } = await bootApp(page, { viewport })

    for (const tab of TABS) {
      await goTab(page, tab)
      // The charts size themselves off the container; let that settle before
      // measuring or shooting.
      await page.waitForTimeout(150)

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))
      // A page that scrolls sideways is a layout bug on a phone. Wide content
      // (the depreciation table) is expected to scroll inside its own container.
      expect(
        overflow.scrollWidth,
        `${tab} at ${viewport.width}px scrolls sideways (${overflow.scrollWidth} > ${overflow.innerWidth})`
      ).toBeLessThanOrEqual(overflow.innerWidth + 1)

      await testInfo.attach(`${name}-${tab}.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    }

    // The detail view, on both its tabs — where the widest tables live.
    await goTab(page, 'garage')
    await page.locator('.vcard').first().click()
    await page.waitForTimeout(150)
    for (const vt of ['overview', 'data']) {
      await page.locator(`[data-vt="${vt}"]`).click()
      await page.waitForTimeout(150)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      )
      expect(
        overflow,
        `vehicle/${vt} at ${viewport.width}px scrolls sideways by ${overflow}px`
      ).toBeLessThanOrEqual(1)

      await testInfo.attach(`${name}-vehicle-${vt}.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    }

    expect(errors, errors.join('\n')).toEqual([])
  })
}

test('the add-vehicle screen fits a phone', async ({ page }, testInfo) => {
  const { errors } = await bootApp(page, { viewport: VIEWPORTS.mobile })

  await page.locator('#addVeh').click()

  // Not asserted in-viewport: this screen leads with the CarEdge instructions,
  // so "add by hand" sits below them by design. What matters is that it is
  // reachable by scrolling and that nothing runs off the side.
  await page.locator('#addManual').scrollIntoViewIfNeeded()
  await expect(page.locator('#addManual')).toBeInViewport()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  )
  expect(overflow).toBeLessThanOrEqual(1)

  await testInfo.attach('mobile-add.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  expect(errors, errors.join('\n')).toEqual([])
})
