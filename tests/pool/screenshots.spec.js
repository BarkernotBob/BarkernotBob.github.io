const { test, expect } = require('@playwright/test')
const { bootApp, goTab, VIEWPORTS } = require('./support/boot')

// GAP-W2 class 4: a screenshot pass at the three widths CLAUDE.md names —
// 390 (phone), 900 (tablet), 1300 (desktop). These are attached to the report
// so a layout change is reviewable, and each one also asserts the two things
// that are cheap to check and expensive to miss: nothing overflows the page
// sideways, and the console stayed clean at that width.
//
// This pass earned its keep immediately: at 390px the Settings tab scrolled
// the whole app sideways by 11px, because the two date inputs in a .row could
// not shrink below their intrinsic width (flex items default to
// min-width:auto). Fixed in the same change that added this file.

const TABS = ['today', 'test', 'schedule', 'weather', 'history', 'settings']

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`${name} (${viewport.width}px): every tab renders without sideways overflow`, async ({
    page,
  }, testInfo) => {
    const { errors } = await bootApp(page, { viewport })
    for (const tab of TABS) {
      await goTab(page, tab)
      // The weather and history tabs draw charts from the fetched series; let
      // any width-dependent render settle before measuring or shooting.
      await page.waitForTimeout(150)

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))
      // A page that scrolls sideways is a layout bug on a phone. Wide content
      // (the weather table) is expected to scroll inside its own container.
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

test('the setup screen fits a phone too', async ({ page }, testInfo) => {
  // The first screen a new device ever shows, and the one place a mistake is
  // unrecoverable — if Connect is off-screen there is no way into the app.
  const { errors } = await bootApp(page, { signedOut: true, viewport: VIEWPORTS.mobile })

  await expect(page.getByRole('button', { name: 'Connect' })).toBeInViewport()
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  )
  expect(overflow).toBeLessThanOrEqual(1)

  await testInfo.attach('mobile-setup.png', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  expect(errors, errors.join('\n')).toEqual([])
})
