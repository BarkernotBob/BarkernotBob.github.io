const { test, expect } = require('@playwright/test')
const { bootApp, goTab, stored, VIEWPORTS, fixtureState } = require('./support/boot')

// Issue #162: sort and filter the Garage (the main page).
//
// Fresh boot = the 16 sample cars: 11 gas, 4 hybrid, 1 EV. The sort and type
// filter are a per-device view preference kept under their own key, never in
// `driveline.v1` — that key is what Export writes, and a view setting leaking
// into someone else's import would be a surprise.
const VIEW_KEY = 'driveline.view.v1'

const names = (page) => page.locator('#vlist .vc-name').allTextContents()
const perYear = async (page) =>
  (await page.locator('#vlist .vc-head-num .big').allTextContents()).map((t) => Number(t.replace(/[$,]/g, '')))
const accents = (page) =>
  page.locator('#vlist .accentbar').evaluateAll((els) => els.map((e) => e.style.background))

test('search narrows the list by name, make or model, and says so', async ({ page }) => {
  const { errors } = await bootApp(page, { fresh: true })
  await expect(page.locator('#vlist .vcard')).toHaveCount(16)
  await expect(page.locator('#gShow')).toBeHidden()

  await page.fill('#gSearch', 'kia')
  expect(await names(page)).toEqual(['Kia Soul', 'Kia K4', 'Kia Niro', 'Kia Sedona'])
  await expect(page.locator('#gShow')).toBeVisible()
  await expect(page.locator('#gShowTxt')).toHaveText('Showing 4 of 16')

  // Words match independently, across make and model.
  await page.fill('#gSearch', 'toyota  PRIUS')
  expect(await names(page)).toEqual(['Toyota Prius'])

  // Typing redraws only the list: the box keeps focus mid-word.
  await page.fill('#gSearch', '')
  await page.locator('#gSearch').pressSequentially('lex')
  await expect(page.locator('#gSearch')).toBeFocused()
  await expect(page.locator('#gSearch')).toHaveValue('lex')
  expect(await names(page)).toEqual(['Lexus ES 350', 'Lexus ES 300h'])

  await page.fill('#gSearch', 'zzz')
  await expect(page.locator('#vlist .vcard')).toHaveCount(0)
  await expect(page.locator('#vlist')).toContainText('No cars match')
  await page.click('#gNoneClear')
  await expect(page.locator('#vlist .vcard')).toHaveCount(16)
  await expect(page.locator('#gSearch')).toHaveValue('')
  expect(errors, errors.join('\n')).toEqual([])
})

test('type filter shows counts, filters, and Clear undoes it', async ({ page }) => {
  await bootApp(page, { fresh: true })
  await expect(page.locator('[data-gtype="all"] .n')).toHaveText('16')
  await expect(page.locator('[data-gtype="gas"] .n')).toHaveText('11')
  await expect(page.locator('[data-gtype="hybrid"] .n')).toHaveText('4')
  await expect(page.locator('[data-gtype="ev"] .n')).toHaveText('1')

  await page.click('[data-gtype="hybrid"]')
  await expect(page.locator('[data-gtype="hybrid"]')).toHaveClass(/\bon\b/)
  await expect(page.locator('[data-gtype="all"]')).not.toHaveClass(/\bon\b/)
  await expect(page.locator('#vlist .vcard')).toHaveCount(4)
  await expect(page.locator('#vlist .badge.hybrid')).toHaveCount(4)
  await expect(page.locator('#gShowTxt')).toHaveText('Showing 4 of 16')

  // Search and type combine.
  await page.fill('#gSearch', 'toyota')
  expect(await names(page)).toEqual(['Toyota Prius', 'Toyota Sienna'])

  await page.click('#gClear')
  await expect(page.locator('#vlist .vcard')).toHaveCount(16)
  await expect(page.locator('[data-gtype="all"]')).toHaveClass(/\bon\b/)
  await expect(page.locator('#gShow')).toBeHidden()
})

test('each sort orders the cars, and cars keep their colour', async ({ page }) => {
  await bootApp(page, { fresh: true })
  const original = await names(page)
  const colourOf = Object.fromEntries(original.map((n, i) => [n, null]))
  const cols = await accents(page)
  original.forEach((n, i) => (colourOf[n] = cols[i]))

  const check = async () => {
    const ns = await names(page)
    const cs = await accents(page)
    ns.forEach((n, i) => expect(cs[i], `${n} changed colour`).toBe(colourOf[n]))
    return ns
  }

  await page.selectOption('#gSort', 'costAsc')
  let v = await perYear(page)
  expect(v).toEqual([...v].sort((a, b) => a - b))
  const asc = await check()

  await page.selectOption('#gSort', 'costDesc')
  v = await perYear(page)
  expect(v).toEqual([...v].sort((a, b) => b - a))
  await check()

  await page.selectOption('#gSort', 'mileAsc')
  const miles = (await page.locator('#vlist .vc-rec').allTextContents()).map((t) =>
    Number(/\$([\d.]+)\/mi/.exec(t)[1])
  )
  expect(miles).toEqual([...miles].sort((a, b) => a - b))
  await check()

  await page.selectOption('#gSort', 'nameAsc')
  const byName = await check()
  expect(byName).toEqual([...original].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })))

  await page.selectOption('#gSort', 'manual')
  expect(await check()).toEqual(original)
  expect(asc).not.toEqual(original)
})

test('model-year sort puts the newest purchase first', async ({ page }) => {
  await bootApp(page, {
    fresh: false,
    mutate: (s) => {
      s.vehicles.forEach((v, i) => (v.purchase = { modelYear: 2019 + i, startMiles: 0, priceOverride: null, holdYears: 5 }))
    },
  })
  await page.selectOption('#gSort', 'yearDesc')
  const years = (await page.locator('#vlist .vc-rec b:first-of-type').allTextContents()).map((t) => Number(t.trim()))
  expect(years.length).toBeGreaterThan(1)
  expect(years).toEqual([...years].sort((a, b) => b - a))
})

test('a car with no cost data always sorts last', async ({ page }) => {
  await bootApp(page, {
    mutate: (s) => {
      const blank = JSON.parse(JSON.stringify(s.vehicles[0]))
      blank.id = 'vblank01'
      blank.name = 'Aaa No Data'
      blank.rows = []
      s.vehicles.unshift(blank)
    },
  })
  for (const sort of ['costAsc', 'costDesc', 'mileAsc', 'yearDesc']) {
    await page.selectOption('#gSort', sort)
    const ns = await names(page)
    expect(ns[ns.length - 1], sort).toBe('Aaa No Data')
  }
  // And its card says it needs data rather than showing a made-up cost.
  const card = page.locator('#vlist .vcard').filter({ hasText: 'Aaa No Data' })
  await expect(card.locator('.big')).toHaveText('—')
  await expect(card).toContainText('Add cost data to model')
})

test('sort and type are remembered on this device, apart from the exported data', async ({ page }) => {
  await bootApp(page, { fresh: true })
  await page.selectOption('#gSort', 'costDesc')
  await page.click('[data-gtype="gas"]')
  await page.fill('#gSearch', 'kia')

  const view = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), VIEW_KEY)
  expect(view).toEqual({ sort: 'costDesc', type: 'gas' })
  const data = await stored(page)
  expect(data === null || !('sort' in data || 'type' in data || 'view' in data)).toBe(true)

  await page.reload()
  await page.locator('#vlist').waitFor()
  await expect(page.locator('#gSort')).toHaveValue('costDesc')
  await expect(page.locator('[data-gtype="gas"]')).toHaveClass(/\bon\b/)
  // The search box is not remembered across a reload.
  await expect(page.locator('#gSearch')).toHaveValue('')
  await expect(page.locator('#vlist .vcard')).toHaveCount(11)

  // Export writes only driveline.v1's state — no view preference in it.
  await goTab(page, 'settings')
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')])
  const body = JSON.parse(require('fs').readFileSync(await download.path(), 'utf8'))
  expect(Object.keys(body).sort()).toEqual(['compare', 'settings', 'vehicles'])
})

test('a junk view preference falls back to the defaults', async ({ page }) => {
  await page.addInitScript((k) => localStorage.setItem(k, '{"sort":"<img>","type":42}'), VIEW_KEY)
  const { errors } = await bootApp(page, { fresh: true })
  await expect(page.locator('#gSort')).toHaveValue('manual')
  await expect(page.locator('[data-gtype="all"]')).toHaveClass(/\bon\b/)
  await expect(page.locator('#vlist .vcard')).toHaveCount(16)
  expect(errors).toEqual([])
})

test('a saved type you no longer own falls back to All instead of hiding every car', async ({ page }) => {
  await page.addInitScript((k) => localStorage.setItem(k, '{"sort":"manual","type":"hybrid"}'), VIEW_KEY)
  // The seeded garage with its hybrid taken out.
  const left = fixtureState().vehicles.filter((v) => v.pt !== 'hybrid').length
  expect(left).toBeGreaterThan(1)
  await bootApp(page, { mutate: (s) => (s.vehicles = s.vehicles.filter((v) => v.pt !== 'hybrid')) })
  await expect(page.locator('[data-gtype="all"]')).toHaveClass(/\bon\b/)
  await expect(page.locator('#vlist .vcard')).toHaveCount(left)
})

test('the controls hide with fewer than two cars', async ({ page }) => {
  await bootApp(page, { mutate: (s) => (s.vehicles = s.vehicles.slice(0, 1)) })
  await expect(page.locator('#gtools')).toHaveCount(0)
  await expect(page.locator('#vlist .vcard')).toHaveCount(1)
})

// CLAUDE.md: tapping a control must never move anything around it. Every
// control, and the list's top edge, must stay put when any of them is used.
for (const [label, viewport] of [['phone', VIEWPORTS.mobile], ['desktop', VIEWPORTS.desktop]]) {
  test(`using the controls never moves them or the list (${label})`, async ({ page }) => {
    await bootApp(page, { viewport, fresh: true })
    const boxes = () =>
      page.evaluate(() =>
        ['#gSearch', '[data-gtype="all"]', '[data-gtype="gas"]', '[data-gtype="hybrid"]', '[data-gtype="ev"]', '#gSort', '#gShow', '#vlist'].map(
          (s) => {
            // Page coordinates, so a shorter list letting the page scroll back
            // a little isn't mistaken for a control moving. The list's own
            // height is meant to change; only its top edge must hold.
            const r = document.querySelector(s).getBoundingClientRect()
            const h = s === '#vlist' ? '' : Math.round(r.height)
            return [s, Math.round(r.x), Math.round(r.y + window.scrollY), Math.round(r.width), h].join(' ')
          }
        )
      )
    // The screen fades up 6px as it opens; measure after that settles, or the
    // animation reads as the controls moving.
    await page.waitForFunction(() => document.getAnimations().every((a) => a.playState === 'finished'))
    const before = await boxes()
    await page.click('[data-gtype="ev"]')
    expect(await boxes()).toEqual(before)
    await page.click('[data-gtype="hybrid"]')
    expect(await boxes()).toEqual(before)
    await page.selectOption('#gSort', 'costDesc')
    expect(await boxes()).toEqual(before)
    await page.fill('#gSearch', 'toy')
    expect(await boxes()).toEqual(before)
    await page.click('#gClear')
    expect(await boxes()).toEqual(before)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('phone stacks the controls, desktop puts them in one row', async ({ page }) => {
  await bootApp(page, { viewport: VIEWPORTS.mobile, fresh: true })
  const top = (s) => page.locator(s).evaluate((e) => Math.round(e.getBoundingClientRect().top))
  expect(await top('.gtype')).toBeGreaterThan(await top('.gsearch'))
  expect(await top('.gsort')).toBeGreaterThan(await top('.gtype'))
  // Inputs stay at 16px on a phone so iOS doesn't zoom when you tap them.
  expect(await page.locator('#gSearch').evaluate((e) => getComputedStyle(e).fontSize)).toBe('16px')
  expect(await page.locator('#gSort').evaluate((e) => getComputedStyle(e).fontSize)).toBe('16px')

  await page.setViewportSize(VIEWPORTS.desktop)
  const a = await top('.gsearch'), b = await top('.gtype'), c = await top('.gsort')
  expect(Math.abs(a - b)).toBeLessThan(12)
  expect(Math.abs(a - c)).toBeLessThan(12)
})
