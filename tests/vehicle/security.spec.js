const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')
const { bootApp, goTab, stored } = require('./support/boot')

// GAP-W2 class 3, and the input to GAP-W4 (#112).
//
// All five apps are served from barkernotbob.github.io, so they share one web
// origin and one localStorage. gt_token, pl_token and bb_token sit side by side
// there. Vehicle stores no token of its own — which makes it the *most*
// dangerous of the four to get wrong, not the least: a payload that runs here
// risks nothing of vehicle's and everything of the other three apps'.
//
// Vehicle is also the app the audit found nearest to safe: one inline handler
// against bank-bonus's ~86 and pool's ~39, and every real behaviour bound in
// JavaScript with `.onclick=`. These tests are what keep it that way.

const APP_HTML = fs.readFileSync(
  path.join(__dirname, '..', '..', 'quartz', 'static', 'vehicle', 'index.html'),
  'utf8'
)
// Counted from the file, not the live page: a baseline read after a hostile
// fixture has already rendered would fold an injected script into itself and
// the assertion could never fail.
const APP_SCRIPTS = (APP_HTML.match(/<script\b/g) || []).length

const HOSTILE = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=1<\/script>"'&`

// Breaks out of a double-quoted ATTRIBUTE rather than injecting an element.
// Vehicle interpolates vehicle ids into data-veh="…" (garage) and data-sel="…"
// (compare). Those were raw, so this id turned into a working onmouseover
// handler — confirmed executing before the fix in this change.
//
// Unlike the inline-handler breakouts pinned in bank-bonus and pool, this one
// IS fixed by escaping: it lands in an attribute value, not inside JavaScript,
// so esc()'s `"` → `&quot;` closes it completely. Both sites now use esc().
const ATTR_BREAKOUT = `x" onmouseover="window.__pwned=1" data-z="`

const TABS = ['garage', 'compare', 'settings']

async function expectInert(page) {
  expect(await page.evaluate(() => window.__pwned), 'payload executed').toBeFalsy()
  expect(await page.locator('img[src="x"]').count(), 'payload became a real element').toBe(0)
  expect(
    await page.evaluate(() => document.querySelectorAll('script').length),
    'payload added a script tag'
  ).toBe(APP_SCRIPTS)
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll('script')].some((s) => (s.textContent || '').includes('__pwned'))
    ),
    'payload landed inside a script tag'
  ).toBe(false)
}

test('a hostile vehicle name renders as text', async ({ page }) => {
  const { errors } = await bootApp(page, {
    mutate: (s) => {
      s.vehicles[0].name = HOSTILE
      s.vehicles[0].make = HOSTILE
      s.vehicles[0].model = HOSTILE
    },
  })

  for (const tab of TABS) await goTab(page, tab)
  await goTab(page, 'garage')
  await page.locator('.vcard').first().click()
  await expectInert(page)

  // And it is genuinely on screen — inert, not silently swallowed, which would
  // hide the value from the person looking at it.
  await page.locator('#backBtn').click()
  await expect(page.locator('#app')).toContainText('<img src=x onerror=')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a hostile vehicle id cannot break out of an attribute', async ({ page }) => {
  // The regression test for the hole this suite found. A vehicle id reaches
  // data-veh= in the garage and data-sel= in compare. Imported files carry
  // their ids verbatim (importData only runs ensurePurchase over them), so an
  // exported-and-edited JSON someone sends you is the whole attack.
  const { errors } = await bootApp(page, {
    mutate: (s) => {
      s.vehicles[0].id = ATTR_BREAKOUT
      s.compare = []
    },
  })

  const injected = await page.evaluate(() =>
    [...document.querySelectorAll('*')].filter((e) => e.hasAttribute('onmouseover')).length
  )
  expect(injected, 'the id created a real event-handler attribute').toBe(0)

  // Hover the card and the compare chip; before the fix either fired.
  await page.locator('.vcard').first().hover()
  await goTab(page, 'compare')
  await page.locator('[data-sel]').first().hover()

  await expectInert(page)
  expect(errors, errors.join('\n')).toEqual([])
})

test('an imported file with a hostile id stays inert', async ({ page }) => {
  // The same payload by its realistic route: a JSON file, imported. This is a
  // normal thing to do with a file someone sent you, which is what makes it
  // worth a separate case from the seeded one above.
  const { errors } = await bootApp(page)
  await goTab(page, 'settings')

  const evil = {
    settings: {},
    vehicles: [
      {
        id: ATTR_BREAKOUT,
        name: HOSTILE,
        make: 'x',
        model: 'x',
        pt: 'gas',
        mpg: 30,
        loanYears: 5,
        rate: 0.06,
        down: 5000,
        rows: [[2025, 20000, 250, 550, 300]],
      },
    ],
    compare: [],
  }

  await page.locator('#importFile').setInputFiles({
    name: 'driveline-vehicles.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(evil)),
  })

  await expect.poll(async () => (await stored(page)).vehicles.length).toBe(1)
  await goTab(page, 'garage')
  await page.locator('.vcard').first().hover()

  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll('*')].filter((e) => e.hasAttribute('onmouseover')).length
    )
  ).toBe(0)
  await expectInert(page)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a hostile value typed into the app is stored and re-rendered inert', async ({ page }) => {
  const { errors } = await bootApp(page)

  await page.locator('.vcard').first().click()
  await page.locator('[data-vt="data"]').click()
  await page.fill('#f_name', HOSTILE)
  await page.locator('#f_name').blur()

  await expect.poll(async () => (await stored(page)).vehicles[0].name).toContain('onerror')

  await page.reload()
  await goTab(page, 'garage')

  await expectInert(page)
  await expect(page.locator('#app')).toContainText('<img src=x onerror=')
  expect(errors, errors.join('\n')).toEqual([])
})

test('no data-bearing inline handler exists in the source', async ({ page }) => {
  // Vehicle's structural advantage, and #112's actual goal. Every real
  // behaviour is bound in JavaScript (`el.onclick = …`), so no user or file
  // data is ever parsed as script.
  //
  // Exactly one literal on*= remains in the file: onclick="return false" on the
  // CarEdge bookmarklet link, which is a constant and interpolates nothing. If
  // that count moves, someone has added an inline handler and the whole class
  // of bug pinned in bank-bonus and pool is back on the table here.
  const inline = APP_HTML.match(/\son[a-z]+=["']/g) || []
  expect(inline, `inline handlers found: ${inline.join(', ')}`).toHaveLength(1)
  expect(APP_HTML).toContain('onclick="return false"')

  // And none of them is built from a template expression.
  const interpolated = APP_HTML.match(/\son[a-z]+="[^"]*\$\{/g) || []
  expect(interpolated, `inline handlers carrying data: ${interpolated.join(', ')}`).toEqual([])

  // Live check too, in case a handler is set via setAttribute at runtime.
  await bootApp(page)
  for (const tab of TABS) await goTab(page, tab)
  const liveInline = await page.evaluate(
    () =>
      [...document.querySelectorAll('*')].filter((e) =>
        [...e.attributes].some((a) => /^on[a-z]+$/.test(a.name))
      ).length
  )
  expect(liveInline).toBeLessThanOrEqual(1)
})

test('vehicle holds no token, and reaches none of the others', async ({ page }) => {
  // Two things at once. Vehicle genuinely stores nothing but its own state key
  // — so there is no vehicle token to steal — and this rig seeds no foreign
  // keys, so a payload that did escape could not quietly lift a real gt_/pl_/
  // bb_ token from the test browser and make the suite look safer than the app.
  await bootApp(page)
  const keys = await page.evaluate(() => Object.keys(localStorage))

  expect(keys).toEqual(['driveline.v1'])
  expect(keys.filter((k) => /^(gt_|pl_|bb_)/.test(k))).toEqual([])
})
