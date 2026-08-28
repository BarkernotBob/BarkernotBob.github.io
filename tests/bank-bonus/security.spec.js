const { test, expect } = require('@playwright/test')
const { bootApp, goTab, fixture } = require('./support/boot')

// GAP-W2 class 3. Every app on barkernotbob.github.io shares one web origin, so
// anything that executes on one page can read the others' saved GitHub tokens —
// gt_token, pl_token and bb_token all sit in localStorage on that origin. A
// hostile value that reaches script in bank-bonus is therefore not a bank-bonus
// bug; it is a grocery and pool bug too.
//
// This suite pins the current behaviour: hostile values render as inert text.
// It is the safety net GAP-W4 (#112) needs before rewriting how these buttons
// are wired — that is a large mechanical change, and this is what catches a slip.

const HOSTILE = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=1<\/script>"'&`

// A different shape of payload: this one does not try to inject markup, it
// breaks out of the single-quoted ARGUMENT of an inline handler. Person names
// are rendered into onclick="setPersonFilter('<tab>','<name>')" (index.html
// ~978, ~1613, ~1731), and esc() escapes & < > " but not '. Substituted in, the
// attribute reads:
//   setPersonFilter('active','x'),window.__pwned=1,('')
// — a valid comma expression, so the payload runs on click.
//
// Note escaping ' as &#39; would NOT fix this: the browser HTML-decodes an
// event-handler attribute before parsing it as JavaScript, so the entity turns
// back into a quote. The fix is to stop putting data in inline handlers at all,
// which is exactly what GAP-W4 (#112) is for.
const HANDLER_BREAKOUT = `x'),window.__pwned=1,('`

const TABS = ['today', 'active', 'planned', 'offers', 'calendar', 'reports', 'settings']

function accountsWith(value) {
  const accounts = JSON.parse(fixture('accounts.json'))
  accounts[0].institution = value
  accounts[0].notes = value
  accounts[0].additionalRequirements = value
  accounts[0].bonusTiming = value
  accounts[0].avoidFees = value
  return JSON.stringify(accounts)
}

function offersWith(value) {
  const offers = JSON.parse(fixture('offers.json'))
  offers[0].institution = value
  offers[0].notes = value
  offers[0].additionalRequirements = value
  return JSON.stringify(offers)
}

function configWith(value) {
  const config = JSON.parse(fixture('config.json'))
  config.people = [value, 'Sam']
  config.owner = value
  return JSON.stringify(config)
}

test('a hostile account value renders as text and never executes', async ({ page }) => {
  const { errors } = await bootApp(page, {
    seed: { 'bb_local_db/accounts.json': accountsWith(HOSTILE) },
  })
  // Count the app's own inline scripts before we go looking for injected ones.
  const baselineScripts = await page.evaluate(() => document.querySelectorAll('script').length)

  for (const tab of TABS) await goTab(page, tab)

  expect(await page.evaluate(() => window.__pwned), 'payload executed').toBeFalsy()
  expect(await page.locator('img[src="x"]').count(), 'payload became a real element').toBe(0)
  expect(
    await page.evaluate(() => document.querySelectorAll('script').length),
    'payload added a script tag'
  ).toBe(baselineScripts)
  expect(errors, errors.join('\n')).toEqual([])

  // And it is genuinely on screen — inert, not silently swallowed, which would
  // hide the value from the person who typed it.
  await goTab(page, 'active')
  await expect(page.locator('#section-active')).toContainText('<img src=x onerror=')
})

test('a hostile offer value renders as text and never executes', async ({ page }) => {
  const { errors } = await bootApp(page, {
    seed: { 'bb_local_db/offers.json': offersWith(HOSTILE) },
  })
  const baselineScripts = await page.evaluate(() => document.querySelectorAll('script').length)
  await goTab(page, 'offers')

  expect(await page.evaluate(() => window.__pwned), 'payload executed').toBeFalsy()
  expect(await page.locator('img[src="x"]').count()).toBe(0)
  expect(await page.evaluate(() => document.querySelectorAll('script').length)).toBe(baselineScripts)
  await expect(page.locator('#section-offers')).toContainText('<img src=x onerror=')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a hostile person name renders as text and never executes', async ({ page }) => {
  // People come from config and are rendered into filter chips, person dots and
  // the select in every "who is opening this?" prompt — the widest reach of the
  // three, so worth its own case.
  const { errors } = await bootApp(page, {
    seed: { 'bb_local_db/config.json': configWith(HOSTILE) },
  })
  const baselineScripts = await page.evaluate(() => document.querySelectorAll('script').length)
  for (const tab of TABS) await goTab(page, tab)

  expect(await page.evaluate(() => window.__pwned), 'payload executed').toBeFalsy()
  expect(await page.locator('img[src="x"]').count()).toBe(0)
  expect(await page.evaluate(() => document.querySelectorAll('script').length)).toBe(baselineScripts)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a hostile value typed into the app is stored and re-rendered inert', async ({ page }) => {
  // The round trip, not just a seeded fixture: type it, save it, re-read it.
  const { errors } = await bootApp(page)
  await goTab(page, 'active')
  const baselineScripts = await page.evaluate(() => document.querySelectorAll('script').length)

  await page.getByRole('button', { name: '+ Add Account' }).first().click()
  const dialog = page.locator('.modal-ov')
  await dialog.locator('#na_inst').fill(HOSTILE)
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  await expect
    .poll(async () =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem('bb_local_db/accounts.json') || '[]').some(
          (a) => a.institution && a.institution.includes('onerror')
        )
      )
    )
    .toBe(true)

  await page.reload()
  await page.locator('.nav-btn[data-tab="today"]').waitFor({ state: 'visible' })
  await goTab(page, 'active')

  expect(await page.evaluate(() => window.__pwned), 'payload executed after round trip').toBeFalsy()
  expect(await page.locator('img[src="x"]').count()).toBe(0)
  expect(await page.evaluate(() => document.querySelectorAll('script').length)).toBe(baselineScripts)
  await expect(page.locator('#section-active')).toContainText('<img src=x onerror=')
  expect(errors, errors.join('\n')).toEqual([])
})

// KNOWN FAILING — pinned deliberately, do not delete or skip.
//
// This documents the injection GAP-W4 (#112) exists to close. It is marked
// test.fail(), so the suite is green while the hole is open AND the run turns
// red the moment it is fixed ("expected to fail but passed"), which is the
// prompt to delete this marker. Confirmed against the app as it stands:
// window.__pwned is set by clicking the person chip.
test('a person name cannot break out of an inline click handler', async ({ page }) => {
  // Inside the body on purpose: at file scope test.fail() applies to every test
  // declared after it, which would quietly mark the whole rest of the file as
  // expected-to-fail.
  test.fail()

  const config = JSON.parse(fixture('config.json'))
  config.people = [HANDLER_BREAKOUT, 'Sam']
  await bootApp(page, { seed: { 'bb_local_db/config.json': JSON.stringify(config) } })
  await goTab(page, 'active')

  const chips = page.locator('#section-active .chip')
  const idx = await chips.evaluateAll((els) =>
    els.findIndex((e) => (e.getAttribute('onclick') || '').includes('__pwned'))
  )
  expect(idx, 'the payload should have landed in an onclick attribute').toBeGreaterThanOrEqual(0)
  // Dispatched in-page: the chip row scrolls horizontally, and a real click can
  // miss it at a narrow viewport, which would look like safety it does not have.
  await chips.nth(idx).evaluate((e) => e.click())

  expect(await page.evaluate(() => window.__pwned), 'payload executed from an inline handler').toBeFalsy()
})

test('no other app token is reachable from this origin in a test run', async ({ page }) => {
  // Guards the assumption the suite rests on: this rig seeds only bb_* keys, so
  // a payload that did escape could not quietly exfiltrate a real gt_/pl_ token
  // from the test browser and make the suite look safer than the app is.
  await bootApp(page)
  const foreign = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => /^(gt_|pl_)/.test(k))
  )
  expect(foreign).toEqual([])
})
