const { test, expect } = require('@playwright/test')
const fs = require('fs')
const path = require('path')
const { bootApp, goTab, stored, fixtureState, VIEWPORTS } = require('./support/boot')

// The cost model, pinned to the audit of 2026-10 (one test per fix). Figures
// come from the real seed rows for the Leaf, Corolla and Soul, at Isaiah's
// 4,000 mi/yr. fixtures/leaf.json carries only annualMiles and modelV in its
// settings, so every other assumption is the app's own default — the golden
// test below proves those defaults too.
const LEAF = path.join(__dirname, 'fixtures', 'leaf.json')
const leafState = () => JSON.parse(fs.readFileSync(LEAF, 'utf8'))

const dollars = (s) => Math.round(parseFloat(String(s).replace(/[^0-9.-]/g, '')))

async function openCar(page, name) {
  await page.locator('.vcard', { hasText: name }).click()
  await expect(page.locator('#abTitle')).toHaveText(name)
}

// Cost breakdown rows as {label: dollars}.
async function breakdown(page) {
  const rows = page.locator('.bd-row:has(.name)')
  await rows.first().waitFor()
  const out = {}
  for (const r of await rows.all()) out[await r.locator('.name').innerText()] = dollars(await r.locator('.bd-val').innerText())
  return out
}

test('a 2017 Leaf at $6,000 kept 10 years costs what the audit says', async ({ page }) => {
  const { errors } = await bootApp(page, { state: leafState() })
  await openCar(page, 'Nissan Leaf')

  await expect(page.locator('.hero .stat .v').first()).toHaveText('$1,703')
  expect(await breakdown(page)).toEqual({
    Depreciation: 2814,
    Electricity: 2157,
    Maintenance: 2533,
    Insurance: 4249,
    'Loan interest': 0,
    Registration: 4397,
    'Sales tax': 420,
    'Cost of cash': 459,
  })
  expect(errors, errors.join('\n')).toEqual([])
})

test('resale scales with the price you paid (F2)', async ({ page }) => {
  // Paying half the curve price must halve the loss too. Before, resale came
  // off the curve whatever you paid, so a bargain looked like it lost less.
  const s = leafState()
  s.vehicles[0].purchase.priceOverride = 3000
  await bootApp(page, { state: s })
  await openCar(page, 'Nissan Leaf')
  expect((await breakdown(page)).Depreciation).toBe(1407)
})

test('an old car keeps losing value past the oldest year CarEdge measured (F1/Q3)', async ({ page }) => {
  // The Corolla's data flattens at ~$16k, and the fitted floor used to hold a
  // 20-year-old car near $11k. The floor now decays past the data.
  await bootApp(page, { state: leafState() })
  await openCar(page, 'Toyota Corolla')
  expect((await breakdown(page)).Depreciation).toBe(6981)
})

test('model v2 counts in today\'s dollars, and migrates the old 3% default once (F3)', async ({ page }) => {
  const s = fixtureState() // an older save: inflation 0.03, no modelV
  s.vehicles[0].pt = 'ev'
  s.vehicles[0].fuelPriceOverride = 3.37 // $/gal-eq under v1
  await bootApp(page, { state: s })

  // load() migrates in memory; the next save writes it.
  page.once('dialog', (d) => d.accept('12000'))
  await page.locator('[data-assume="annualMiles"]').click()
  await expect.poll(async () => (await stored(page)).settings.modelV).toBe(2)
  const after = await stored(page)
  expect(after.settings.inflation).toBe(0)
  expect(after.vehicles[0].fuelPriceOverride).toBeCloseTo(0.1, 3) // 3.37 $/gal-eq ÷ 33.7 kWh

  // A rate the user typed is theirs, and a v2 save is never migrated again.
  page.once('dialog', (d) => d.accept('3'))
  await page.locator('[data-assume="inflation"]').click()
  await expect.poll(async () => (await stored(page)).settings.inflation).toBeCloseTo(0.03, 5)
  await page.reload()
  await expect(page.locator('[data-assume="inflation"]')).toContainText('3.0%')
})

test('a fresh device starts in today\'s dollars', async ({ page }) => {
  await bootApp(page, { fresh: true })
  await expect(page.locator('[data-assume="inflation"]')).toContainText('0.0%')
})

test('the lowest-cost pick warns when it sits at the edge of the data (F4)', async ({ page }) => {
  // The Leaf's cheapest plan at 4,000 mi/yr is the oldest year held the full
  // 20 years, which leans entirely on extrapolation.
  await bootApp(page, { state: leafState(), viewport: VIEWPORTS.desktop })
  await openCar(page, 'Nissan Leaf')
  await expect(page.locator('#edgeWarn')).toBeVisible()
  await expect(page.locator('#edgeWarn')).toContainText('oldest model year and longest hold')

  // The Soul's (2025, 10 years) is inside the data: no warning, but the slot
  // still holds its space so nothing below it moves.
  await page.locator('#backBtn').click()
  page.once('dialog', (d) => d.accept('10000'))
  await page.locator('[data-assume="annualMiles"]').click()
  await expect(page.locator('[data-assume="annualMiles"]')).toContainText('10,000')
  await openCar(page, 'Kia Soul')
  await expect(page.locator('#edgeWarn')).toBeHidden()
  const box = await page.locator('#edgeWarn').boundingBox()
  expect(box.height).toBeGreaterThan(0)
})

test('time-based maintenance share defaults to 40% and is editable (F5)', async ({ page }) => {
  await bootApp(page, { state: leafState() })
  await goTab(page, 'settings')
  await expect(page.locator('#s_mts')).toHaveValue('40')
  await page.fill('#s_mts', '100')
  await page.locator('#s_mts').press('Enter')
  await expect.poll(async () => (await stored(page)).settings.maintTimeShare).toBe(1)

  await goTab(page, 'garage')
  await openCar(page, 'Nissan Leaf')
  expect((await breakdown(page)).Maintenance).toBe(4384)
})

test('an EV is charged by the kWh, not the gallon (F7)', async ({ page }) => {
  // 4,000 mi ÷ 100 MPGe × 33.7 kWh × $0.32 = $431/yr; was priced off gas.
  await bootApp(page, { state: leafState() })
  await goTab(page, 'settings')
  await page.fill('#s_kwh', '0.32')
  await page.locator('#s_kwh').press('Enter')
  await expect.poll(async () => (await stored(page)).settings.kwhPrice).toBe(0.32)

  await goTab(page, 'garage')
  await openCar(page, 'Nissan Leaf')
  expect((await breakdown(page)).Electricity).toBe(4314)
})

test('switching a car between electric and gas clears its price override', async ({ page }) => {
  // The override's unit flips between $/kWh and $/gal, so a carried-over
  // number would be ~30x off.
  const s = leafState()
  s.vehicles[0].fuelPriceOverride = 0.12
  await bootApp(page, { state: s })
  await openCar(page, 'Nissan Leaf')
  await page.locator('[data-vt="data"]').click()
  await expect(page.locator('#f_fuel')).toHaveValue('0.12')
  await page.selectOption('#f_pt', 'gas')
  await expect.poll(async () => (await stored(page)).vehicles[0].fuelPriceOverride).toBeNull()
})

test('loan interest counts only the months you hold the car (F8)', async ({ page }) => {
  // $1,500 financed over 5 years at 6%: selling after 2 years pays 2 years'
  // interest, not the whole loan's.
  const s = leafState()
  s.vehicles[0].purchase = { modelYear: 2019, startMiles: 81000, priceOverride: 11500, holdYears: 2 }
  await bootApp(page, { state: s })
  await openCar(page, 'Nissan Leaf')
  expect((await breakdown(page))['Loan interest']).toBe(149)
})

test('Compare labels the newest model year honestly (F9)', async ({ page }) => {
  await bootApp(page, { state: leafState() })
  await goTab(page, 'compare')
  await expect(page.locator('[data-basis="new"]')).toHaveText('Newest year')
})

// A trimmed CarEdge Depreciation page: insurance sentence + the Years Old table.
const CAREDGE_PASTE = [
  'The average cost to insure a Testa Roadster is about $1,000 per year.',
  'Years Old\tDepreciation\tResidual Value\tResale Value\tEst. Mileage\tResale Year',
  '1\t$4,000\t80%\t$16,000\t12,000\t2025',
  '2\t$6,000\t70%\t$14,000\t24,000\t2026',
].join('\n')

async function importPaste(page) {
  await page.locator('#addVeh').click()
  await page.fill('#ceText', CAREDGE_PASTE)
  await page.fill('#ceName', 'Testa Roadster')
  await page.click('#ceAdd')
  await expect(page.locator('#abTitle')).toHaveText('Testa Roadster')
  const st = await stored(page)
  return st.vehicles.find((v) => v.name === 'Testa Roadster').rows
}

test('imported insurance eases with the car\'s value, by half (F6)', async ({ page }) => {
  // Liability doesn't depreciate; only the collision/comp half tracks value.
  await bootApp(page)
  const rows = await importPaste(page)
  expect(rows.map((r) => r[3])).toEqual([1000, 900, 850])
})

test('an import without registration borrows it from your own cars (F11)', async ({ page }) => {
  // The fixture's only gas car registers for $300 in its newest year.
  await bootApp(page)
  const rows = await importPaste(page)
  expect(rows.map((r) => r[4])).toEqual([300, 297, 294])
  await expect(page.locator('#toast')).toContainText('registration estimated')
})

test('the bookmarklet carries the same half-scaled insurance', async ({ page }) => {
  await bootApp(page)
  await page.locator('#addVeh').click()
  const href = await page.locator('#bmBtn').getAttribute('href')
  const src = decodeURIComponent(href.slice('javascript:'.length))
  expect(src).toContain('insBase*(0.5+0.5*r.paid/100)')
})

test('the cost breakdown bars actually fill', async ({ page }) => {
  // .bd-fill is a <span>; without display:block its width was ignored and
  // every bar rendered empty.
  await bootApp(page, { state: leafState() })
  await openCar(page, 'Nissan Leaf')
  const row = page.locator('.bd-row', { hasText: 'Registration' })
  const fill = await row.locator('.bd-fill').boundingBox()
  const track = await row.locator('.bd-track').boundingBox()
  expect(fill.width).toBeGreaterThan(track.width * 0.9) // the largest line fills its track
})
