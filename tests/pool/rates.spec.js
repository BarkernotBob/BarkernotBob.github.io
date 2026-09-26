// pool-data#3 — measured drain/fill rates shown in the app, not just the config.
//
// Before this, the waste-valve drain rate Isaiah timed (7–10 min, Hayward
// Vari-Flo XL) sat in db/config.json as waterLevel.drainRate, which nothing
// read, and the hose fill rate was a sentence buried in the water-level note.
// Now both are rows in ONE list, waterLevel.rates, shown on Schedule → Water
// level, and a new measurement is added from the app as another row.
const { test, expect } = require('@playwright/test')
const { bootApp, goTab, VIEWPORTS } = require('./support/boot')

const configOf = (mock) => JSON.parse(mock.readFile('db/config.json'))
const baseConfig = () => JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'fixtures/db/config.json'), 'utf8'))

// The shape pool-data's config had when the issue was filed.
function legacyConfig() {
  const c = baseConfig()
  c.waterLevel = {
    note: 'Keep between the lowest and highest side screws. Filling adds ~1 inch per hour with the hose.',
    drainRate: {
      note: 'Waste valve (Hayward Vari-Flo XL, pump on WASTE) drains from an overflowing skimmer basket to acceptable level in ~7-10 min.',
      measuredMinutesRange: [7, 10],
      measuredAt: '2026-07-10',
    },
  }
  return JSON.stringify(c)
}

const card = (page) => page.locator('#waterCard')
const row = (page, id) => page.locator(`#waterCard .rate[data-rate="${id}"]`)
const dialog = (page) => page.locator('.modal-ov')

test('an older config shows its drain and fill rates on Schedule, without repeating the fill sentence', async ({ page }) => {
  const { errors } = await bootApp(page, { db: { 'config.json': legacyConfig() } })
  await goTab(page, 'schedule')
  await expect(row(page, 'drain')).toContainText('Drain — waste valve')
  await expect(row(page, 'drain').locator('.rateval')).toHaveText('7–10 min')
  await expect(row(page, 'drain')).toContainText('Hayward Vari-Flo XL')
  await expect(row(page, 'drain')).toContainText('Measured 07/10/26')
  await expect(row(page, 'fill').locator('.rateval')).toHaveText('1 in / hr')
  await expect(row(page, 'fill')).toContainText('Rule of thumb')
  await expect(card(page)).toContainText('Keep between the lowest and highest side screws.')
  await expect(card(page)).not.toContainText('Filling adds')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a new measurement is added from the app and saved as another row', async ({ page }) => {
  const { mock, errors } = await bootApp(page, { db: { 'config.json': legacyConfig() } })
  await goTab(page, 'schedule')
  await page.getByRole('button', { name: '+ Add a measurement' }).click()
  // Numeric keypad on the number fields, a date picker on the date.
  await expect(page.locator('#rt_min')).toHaveAttribute('inputmode', 'decimal')
  await expect(page.locator('#rt_max')).toHaveAttribute('inputmode', 'decimal')
  await expect(page.locator('#rt_at')).toHaveAttribute('type', 'date')
  await page.fill('#rt_label', 'Backwash — until clear')
  await page.fill('#rt_min', '2')
  await page.fill('#rt_max', '3')
  await page.fill('#rt_detail', 'Sight glass goes clear.')
  await dialog(page).getByRole('button', { name: 'Save' }).click()

  await expect.poll(() => (configOf(mock).waterLevel.rates || []).length).toBe(3)
  const wl = configOf(mock).waterLevel
  expect(wl.rates[2]).toMatchObject({ label: 'Backwash — until clear', min: 2, max: 3, unit: 'min', detail: 'Sight glass goes clear.', measuredAt: '2026-07-15' })
  expect(wl.rates[2].id).toMatch(/^r_/)
  // The legacy keys were migrated, not left as a second copy.
  expect(wl.drainRate).toBeUndefined()
  expect(wl.rates[1]).toMatchObject({ id: 'drain', min: 7, max: 10, unit: 'min', measuredAt: '2026-07-10' })
  expect(wl.note).toBe('Keep between the lowest and highest side screws.')
  await expect(card(page).locator('.rate')).toHaveCount(3)
  await expect(card(page)).toContainText('2–3 min')
  expect(errors, errors.join('\n')).toEqual([])
})

test('editing a measurement updates it; a single value shows without a range', async ({ page }) => {
  const { mock } = await bootApp(page)
  await goTab(page, 'schedule')
  // The fixture config has no rates at all — it gets the default fill row.
  await row(page, 'fill').getByRole('button', { name: /Edit/ }).click()
  await expect(page.locator('#rt_min')).toHaveValue('1')
  await page.fill('#rt_min', '1.5')
  await page.fill('#rt_at', '2026-07-12')
  await dialog(page).getByRole('button', { name: 'Save' }).click()
  await expect(row(page, 'fill').locator('.rateval')).toHaveText('1.5 in / hr')
  await expect(row(page, 'fill')).toContainText('Measured 07/12/26')
  const fill = configOf(mock).waterLevel.rates.find((r) => r.id === 'fill')
  expect(fill).toMatchObject({ min: 1.5, max: null, measuredAt: '2026-07-12' })
})

test('a bad value reopens the form with what was typed and saves nothing', async ({ page }) => {
  const { mock } = await bootApp(page)
  await goTab(page, 'schedule')
  const before = mock.readFile('db/config.json')
  await page.getByRole('button', { name: '+ Add a measurement' }).click()
  await page.fill('#rt_label', 'Drain — main drain')
  await page.fill('#rt_min', '10')
  await page.fill('#rt_max', '4')
  await dialog(page).getByRole('button', { name: 'Save' }).click()
  // Shown inside the reopened form, where it can be seen — not a toast under the backdrop.
  await expect(dialog(page).getByRole('alert')).toBeVisible()
  await expect(dialog(page).getByRole('alert')).toContainText('can’t be less')
  await expect(page.locator('#rt_label')).toHaveValue('Drain — main drain')
  await expect(page.locator('#rt_max')).toHaveValue('4')
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog(page)).toHaveCount(0)
  expect(mock.readFile('db/config.json')).toBe(before)
})

test('deleting a measurement asks first and removes only that row', async ({ page }) => {
  const { mock } = await bootApp(page, { db: { 'config.json': legacyConfig() } })
  await goTab(page, 'schedule')
  await row(page, 'drain').getByRole('button', { name: /Edit/ }).click()
  await dialog(page).getByRole('button', { name: 'Delete this measurement' }).click()
  await dialog(page).getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(row(page, 'drain')).toHaveCount(0)
  await expect(row(page, 'fill')).toHaveCount(1)
  await expect.poll(() => configOf(mock).waterLevel.rates.map((r) => r.id)).toEqual(['fill'])
})

for (const [name, viewport] of [['phone', VIEWPORTS.mobile], ['desktop', VIEWPORTS.desktop]]) {
  test(`water level card at ${viewport.width}px: no sideways scroll, opening and cancelling Edit moves nothing`, async ({ page }, info) => {
    await bootApp(page, { viewport, db: { 'config.json': legacyConfig() } })
    await goTab(page, 'schedule')
    await card(page).scrollIntoViewIfNeeded()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    const boxes = async () => Promise.all(['#waterCard', '#waterCard .rate[data-rate="drain"]', '#waterCard [data-action="addRate"]']
      .map(async (s) => page.locator(s).boundingBox()))
    const before = await boxes()
    await info.attach(`water-level-${name}`, { body: await card(page).screenshot(), contentType: 'image/png' })
    await row(page, 'drain').getByRole('button', { name: /Edit/ }).click()
    await expect(dialog(page)).toBeVisible()
    await info.attach(`edit-measurement-${name}`, { body: await page.screenshot(), contentType: 'image/png' })
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog(page)).toHaveCount(0)
    expect(await boxes()).toEqual(before)
  })
}
