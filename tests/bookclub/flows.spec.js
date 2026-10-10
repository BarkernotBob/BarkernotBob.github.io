// Main paths of the book club scheduler, run at desktop and phone size.
const { test, expect } = require('@playwright/test')
const { mockApi, PAGE } = require('./support/mock-api')

/** Tap on touch devices (the editor treats touch and mouse differently), click otherwise. */
const press = (loc, isMobile) => (isMobile ? loc.tap() : loc.click())

async function signIn(page, name, pin) {
  await page.locator('#who [data-action="start"]').click()
  await page.locator('#in-name').fill(name)
  await page.locator('#in-pin').fill(pin)
  await page.locator('#signin-btn').click()
}

test('opening the link shows the group picture without signing in', async ({ page }) => {
  await mockApi(page)
  await page.goto(PAGE)
  await expect(page.locator('#stats')).toContainText('4')
  await expect(page.locator('#stats')).toContainText('people')
  const first = page.locator('#best .best-item').first()
  await expect(first).toContainText('Tuesday · 7–9 PM')
  await expect(first).toContainText('Everyone can make it')
  await expect(first).toContainText('4/4')
  // Jordan can only do every 4 weeks, so that's the rhythm everyone can make.
  await expect(page.locator('#stats')).toContainText('4 weeks')
  // Calendar marks the everyone-free hours.
  await expect(page.locator('#group-grid [data-slot="1-19"]')).toHaveClass(/all/)
  await expect(page.locator('#reading')).toContainText('Priya')
})

test('a new person signs in, adds times, and sees themselves in the group', async ({ page, isMobile }) => {
  const db = await mockApi(page)
  await page.goto(PAGE)
  await signIn(page, 'Sam', '5678')
  await expect(page.locator('#view-me')).toBeVisible()
  await expect(page.locator('#toast')).toContainText('Welcome, Sam')

  await press(page.locator('#my-grid [data-slot="1-19"]'), isMobile)
  await press(page.locator('#my-grid [data-slot="1-20"]'), isMobile)
  await expect(page.locator('#my-grid [data-slot="1-19"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#save-state')).toHaveClass(/dirty/)
  await page.locator('[data-cadence="3"]').click()
  await page.locator('[data-hours="6"]').click()
  await page.locator('#save-btn').click()

  await expect(page.locator('#toast')).toContainText('Saved!')
  await expect(page.locator('#view-group')).toBeVisible()
  await expect(page.locator('#best .best-item').first()).toContainText('5/5')
  await expect(page.locator('#people-filter')).toContainText('Sam')
  await expect(page.locator('#members')).toContainText('Sam')
  const sam = db.members.find((m) => m.name === 'Sam')
  expect(sam).toMatchObject({ cadence: 3, hours: 6 })
  expect(sam.slots.sort()).toEqual(['1-19', '1-20'])
})

test('coming back on the same device keeps you signed in with your answers', async ({ page }) => {
  await mockApi(page)
  await page.goto(PAGE)
  await signIn(page, 'priya', '3333') // name match is case-insensitive
  await expect(page.locator('#toast')).toContainText('Welcome back, Priya')
  await expect(page.locator('#my-grid [data-slot="5-11"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-hours="8"]')).toHaveAttribute('aria-checked', 'true')
  await page.reload()
  await expect(page.locator('#who')).toContainText('Priya')
})

test('a wrong PIN for an existing name is refused with a clear message', async ({ page }) => {
  await mockApi(page)
  await page.goto(PAGE)
  await signIn(page, 'Hannah', '9999')
  await expect(page.locator('#signin-error')).toContainText("doesn't match Hannah")
  await expect(page.locator('#signin')).toBeVisible()
  await expect(page.locator('#view-me')).toBeHidden()
})

test('saving with a step missing says which step, and saves nothing', async ({ page, isMobile }) => {
  const db = await mockApi(page)
  await page.goto(PAGE)
  await signIn(page, 'Sam', '5678')
  await press(page.locator('#my-grid [data-slot="0-18"]'), isMobile)
  await page.locator('#save-btn').click()
  await expect(page.locator('#toast')).toContainText('step 2')
  expect(db.members.some((m) => m.name === 'Sam')).toBe(false)
})

test('a whole-row label fills that hour every day', async ({ page }) => {
  await mockApi(page)
  await page.goto(PAGE)
  await signIn(page, 'Sam', '5678')
  await page.locator('#my-grid [data-hour="18"]').click()
  await expect(page.locator('#my-grid .cell[aria-pressed="true"]')).toHaveCount(7)
  await expect(page.locator('#my-count')).toContainText('7 hours')
})

test('clicking never shifts the layout', async ({ page, isMobile }) => {
  await mockApi(page)
  await page.goto(PAGE)
  await signIn(page, 'Sam', '5678')
  // Page coordinates, so the sticky save bar or a scroll can't fake a shift.
  const box = () => page.locator('#my-grid').evaluate((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y + scrollY, r.width, r.height] })
  const bar = () => page.locator('.savebar').boundingBox()
  const [g0, b0] = [await box(), await bar()]
  await press(page.locator('#my-grid [data-slot="2-12"]'), isMobile)
  await page.locator('[data-cadence="2"]').click()
  await page.locator('[data-hours="10"]').click()
  expect(await box()).toEqual(g0)
  expect((await bar()).height).toBe(b0.height)

  // Sign-in error text has its space reserved, so the sheet doesn't grow.
  page.once('dialog', (d) => d.accept()) // "unsaved changes, sign out anyway?"
  await page.locator('#who [data-action="signout"]').click()
  await page.locator('#who [data-action="start"]').click()
  const sheet = () => page.locator('#signin-form').boundingBox()
  const s0 = await sheet()
  await page.locator('#in-name').fill('Hannah')
  await page.locator('#in-pin').fill('0000')
  await page.locator('#signin-btn').click()
  await expect(page.locator('#signin-error')).not.toBeEmpty()
  expect((await sheet()).height).toBe(s0.height)
})
