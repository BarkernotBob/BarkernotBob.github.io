const { test, expect } = require('@playwright/test')
const { bootApp } = require('./support/boot')

// S4 Today screen (§12 S4): the at-a-glance home. Asserts the composed sections
// render from the mocked db, provenance stamps distinguish Snap vs Sync, and the
// "Used" action commits + re-renders with a clean console.

test('Today composes use-up, sync strip, week spend, and recent trips', async ({ page }) => {
  const { errors } = await bootApp(page)
  const main = page.locator('#main')
  // Fixtures: milk is a pending, still-active perishable; the banana reminder
  // points at a thrown-away item and is correctly excluded from "use up".
  await expect(main.getByText(/thing to use up/)).toBeVisible()
  await expect(main.getByText('Whole milk')).toBeVisible()
  await expect(main.locator('.slbar')).toHaveCount(1)
  // Overdue milk (2020) gets the "Use today" stamp; future banana gets "Use by".
  await expect(main.locator('.stamp.today')).toBeVisible()
  // Sync strip: the unprocessed fixture receipt is "waiting for Claude".
  await expect(main.getByText(/waiting for Claude/)).toBeVisible()
  // This-week tile + 8-wk sparkline.
  await expect(main.locator('.week .spark')).toBeVisible()
  // Recent trips carry provenance: the photographed Publix receipt is a Snap.
  await expect(main.getByText('Recent trips')).toBeVisible()
  await expect(main.locator('.trow .prov.snap')).toBeVisible()
  expect(errors, errors.join(' | ')).toEqual([])
})

test('marking a use-up item "Used" consumes it in place, no reflow', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  const main = page.locator('#main')
  await expect(main.getByText('Whole milk')).toBeVisible()

  // A section below the use-up list must not move when "Used" is tapped (§8.4).
  const week = main.locator('.week')
  const before = await week.boundingBox()

  await main.locator('.urow', { hasText: 'Whole milk' }).locator('.mini.use').click()
  await expect(page.locator('.toast')).toContainText('Marked used')

  // Row stays (reserved height), marked used in place — not re-rendered out.
  await expect(main.locator('.urow.done')).toBeVisible()
  await expect(main.getByText('Whole milk')).toBeVisible()
  const after = await week.boundingBox()
  expect(Math.abs(after.y - before.y), 'week tile shifted on Used tap').toBeLessThanOrEqual(1)

  // The commit landed: the item is consumed and its reminder is done.
  const items = JSON.parse(mock.readFile('db/items.json'))
  expect(items.find((i) => i.id === 'i_milk_0001').status).toBe('consumed')
  const reminders = JSON.parse(mock.readFile('db/reminders.json'))
  expect(reminders.find((r) => r.id === 'rem_milk_0001').status).toBe('done')
  expect(errors, errors.join(' | ')).toEqual([])
})
