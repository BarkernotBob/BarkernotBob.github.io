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

// Issue #144 — CLAUDE.md: clicking must never reflow the UI. Tapping Done on a
// due task used to re-render Today, dropping the row and pulling every card
// below it up the screen; the next Done had moved by the time you reached it.
test('tapping Done on Today moves nothing (390px)', async ({ page }, testInfo) => {
  const { errors } = await bootApp(page, { viewport: VIEWPORTS.mobile })
  const box = async (loc) => {
    const b = await loc.boundingBox()
    return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
  }
  const weather = page.locator('#main .card').filter({ hasText: 'Recent weather' })
  const due = page.locator('#main .card').filter({ hasText: 'Due now' })
  const rows = page.locator('#main .item:has([data-action="markTask"])')
  const n = await rows.count()
  expect(n).toBeGreaterThan(1)

  const before = { weather: await box(weather), due: await box(due), nav: await box(page.locator('nav')),
    tabs: await Promise.all(TABS.map((t) => box(page.locator(`nav button[data-tab="${t}"]`)))),
    rows: await Promise.all([...Array(n).keys()].map((i) => box(rows.nth(i)))) }

  // Mark every due task done, one after the other — the badge ticks down to
  // nothing on the way, and the second button must be where the first left it.
  for (let i = 0; i < n; i++) {
    await rows.nth(i).locator('[data-action="markTask"]').click()
    await expect(rows.nth(i)).toHaveClass(/is-done/)
    expect(await box(rows.nth(i))).toEqual(before.rows[i])
  }
  // The seasonal prompt is not a Done row, so the badge may keep a count; what
  // matters is that nothing moved.
  expect(await box(weather)).toEqual(before.weather)
  expect(await box(due)).toEqual(before.due)
  expect(await box(page.locator('nav'))).toEqual(before.nav)
  expect(await Promise.all(TABS.map((t) => box(page.locator(`nav button[data-tab="${t}"]`))))).toEqual(before.tabs)

  await testInfo.attach('mobile-today-after-done.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  expect(errors, errors.join('\n')).toEqual([])
})
