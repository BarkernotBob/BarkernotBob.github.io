const { test, expect } = require('@playwright/test')
const { bootApp, goTab, stored, VIEWPORTS } = require('./support/boot')

// Issue #163: "don't reset when a car is selected".
//
// The Compare chip row scrolls sideways — 16 sample cars never fit. Every tap
// used to rebuild the screen with innerHTML, which threw the row away and
// snapped it back to the first car, so picking the 12th car meant scrolling
// all the way back out to pick the 13th. The page itself must not jump either.
// Fresh boot = the 16 samples, which is what makes the row overflow at every
// width.
for (const [label, viewport] of [['phone', VIEWPORTS.mobile], ['desktop', VIEWPORTS.desktop]]) {
  test(`selecting a car keeps the chip row and the page where they were (${label})`, async ({ page }) => {
    const { errors } = await bootApp(page, { viewport, fresh: true })
    await goTab(page, 'compare')

    const row = page.locator('.selrow')
    const overflow = await row.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow, 'chip row should overflow with 16 cars').toBeGreaterThan(100)

    // Scroll the row to the far end and the page down a little, then pick a car
    // near the end (one that is visible there and not yet selected).
    await row.evaluate((el) => { el.scrollLeft = el.scrollWidth })
    await page.evaluate(() => window.scrollTo(0, 40))
    const last = page.locator('[data-sel]').last()
    // Playwright scrolls a target into view before clicking it, which can nudge
    // the row a pixel or two on its own. Hover first so that nudge happens
    // before the baseline is read, and the test measures only the app.
    await last.hover()
    const before = await row.evaluate((el) => el.scrollLeft)
    const pageBefore = await page.evaluate(() => window.scrollY)
    expect(before).toBeGreaterThan(100)

    const id = await last.getAttribute('data-sel')
    await last.click()

    await expect.poll(async () => (await stored(page)).compare).toContain(id)
    await expect(page.locator(`[data-sel="${id}"]`)).toHaveClass(/\bon\b/)
    // It is a fresh node after the re-render; read the row again.
    expect(await page.locator('.selrow').evaluate((el) => el.scrollLeft)).toBe(before)
    expect(await page.evaluate(() => window.scrollY)).toBe(pageBefore)

    // Deselecting must hold too, and so must the other controls that redraw.
    await page.locator(`[data-sel="${id}"]`).click()
    await expect(page.locator(`[data-sel="${id}"]`)).not.toHaveClass(/\bon\b/)
    expect(await page.locator('.selrow').evaluate((el) => el.scrollLeft)).toBe(before)

    await page.locator('[data-basis="new"]').click()
    await expect(page.locator('[data-basis="new"]')).toHaveClass(/\bon\b/)
    expect(await page.locator('.selrow').evaluate((el) => el.scrollLeft)).toBe(before)
    expect(await page.evaluate(() => window.scrollY)).toBe(pageBefore)

    expect(errors, errors.join('\n')).toEqual([])
  })
}

test('opening Compare fresh still starts the chip row at the first car', async ({ page }) => {
  // Keeping the scroll is for re-renders within Compare, not for arriving on it.
  await bootApp(page, { fresh: true })
  await goTab(page, 'compare')
  await page.locator('.selrow').evaluate((el) => { el.scrollLeft = el.scrollWidth })
  await goTab(page, 'garage')
  await goTab(page, 'compare')
  expect(await page.locator('.selrow').evaluate((el) => el.scrollLeft)).toBe(0)
})
