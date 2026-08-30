const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')
const { bootApp, goTab, fixture } = require('./support/boot')

// Read from disk, not from the live page: counting a rendered document would
// fold an injected attribute into the baseline and the assertion could never
// fail.
const APP_HTML = fs.readFileSync(
  path.join(__dirname, '..', '..', 'quartz', 'static', 'bank-bonus', 'index.html'),
  'utf8'
)

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

test('a hostile person name is inert in the "who is opening this?" chooser', async ({ page }) => {
  // The chooser is built by promoteOffer() and only exists while that modal is
  // open, so walking the tabs never reaches it. It rendered names into both a
  // data-mval attribute and the button label with no escaping — found by review
  // after the handler rewrite, since taking values out of executable positions
  // does nothing about values injected as markup.
  const { errors } = await bootApp(page, {
    seed: { 'bb_local_db/config.json': configWith(HOSTILE) },
  })
  const baselineScripts = await page.evaluate(() => document.querySelectorAll('script').length)

  await goTab(page, 'offers')
  await page.getByRole('button', { name: 'Move to Planned' }).first().click()
  await expect(page.locator('.modal-ov')).toBeVisible()

  expect(await page.evaluate(() => window.__pwned), 'payload executed').toBeFalsy()
  expect(await page.locator('img[src="x"]').count(), 'payload became a real element').toBe(0)
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

// The injection GAP-W4 (#112) existed to close. Closed by the delegated-dispatch
// rewrite: person names now travel in data-a1 and the action name is looked up
// in a fixed table, so no value reaches an executable position.
//
// This was pinned test.fail() while the hole was open, on the theory that the
// run would turn red the moment it was fixed. It would not have. The first
// assertion required the payload to LAND in an onclick attribute, so once the
// attributes were gone the test still failed — for a new reason — and
// test.fail() went on reporting green. Verified before rewriting it. It now
// asserts the safety property directly.
test('a hostile person name cannot reach an executable position', async ({ page }) => {
  const config = JSON.parse(fixture('config.json'))
  config.people = [HANDLER_BREAKOUT, 'Sam']
  await bootApp(page, { seed: { 'bb_local_db/config.json': JSON.stringify(config) } })
  await goTab(page, 'active')

  // The structural guarantee, not a property of this one payload: with no
  // inline handler anywhere, there is no executable position to break into.
  expect(await page.locator('[onclick]').count(), 'an inline handler came back').toBe(0)

  // The name must still arrive intact as DATA. Asserting only "nothing ran"
  // would also pass if the rewrite had simply dropped the chip.
  const chip = page.locator(
    `#section-active .chip[data-action="setPersonFilter"][data-a2=${JSON.stringify(HANDLER_BREAKOUT)}]`
  )
  expect(await chip.count(), 'the hostile name should still render a working chip').toBeGreaterThan(0)

  // Dispatched in-page: the chip row scrolls horizontally, and a real click can
  // miss it at a narrow viewport, which would look like safety it does not have.
  await chip.first().evaluate((e) => e.click())

  expect(await page.evaluate(() => window.__pwned), 'payload executed').toBeFalsy()
})

// The rewrite above is only durable if the attributes stay gone. Grocery was
// hardened the same way and stayed that way because a test said so; bank-bonus
// reached 86 inline handlers precisely because nothing was watching.
test('the app declares no inline event handlers', () => {
  // Named events rather than `on[a-z]+`: quoting is not what makes a handler
  // dangerous, so this catches onclick="…", onclick='…' and unquoted alike.
  // A looser `on\w+=` matches ordinary JavaScript in the same file — `onHand
  // = {}` is a variable here, not an attribute — and a guard that cries wolf
  // gets deleted, which is how the handlers accumulated in the first place.
  const EVENTS =
    'click|dblclick|change|input|blur|focus|submit|reset|select|keydown|keyup|keypress|' +
    'mouse[a-z]+|touch[a-z]+|pointer[a-z]+|drag[a-z]*|drop|paste|copy|cut|wheel|scroll|' +
    'contextmenu|load|error|toggle|animationend|transitionend'
  const inline = APP_HTML.match(new RegExp(`\\son(${EVENTS})\\s*=`, 'gi')) || []
  expect(inline, `inline handlers found: ${inline.join(', ')}`).toEqual([])
})

// Every data-action/-change/-input/-blur/-enter in the markup must resolve to an
// entry in ACTIONS. With 86 handlers rewritten and far fewer than 86 of them
// covered by a click in this suite, a typo in a name would otherwise sit in a
// button nothing presses until the day it is pressed.
test('every wired action resolves in the dispatch table', async ({ page }) => {
  await bootApp(page)
  const wired = new Set()
  for (const attr of ['action', 'change', 'input', 'blur', 'enter']) {
    for (const m of APP_HTML.matchAll(new RegExp(`data-${attr}="([^"]*)"`, 'g'))) wired.add(m[1])
  }
  // backFn picks between two names at render time.
  wired.delete('${backFn}')
  wired.add('backToCalendar')
  wired.add('backFromDetail')

  // Bare `ACTIONS`, not window.ACTIONS: it is a top-level `const`, which lives
  // in the global lexical scope and never becomes a window property. Reading it
  // off window would be undefined for every name and pass vacuously.
  const missing = await page.evaluate(
    (names) => names.filter((n) => typeof ACTIONS[n] !== 'function'),
    [...wired]
  )
  expect(wired.size, 'no actions were found in the markup').toBeGreaterThan(40)
  expect(missing, `wired but not in ACTIONS: ${missing.join(', ')}`).toEqual([])
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
