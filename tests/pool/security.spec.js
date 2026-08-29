const { test, expect } = require('@playwright/test')
const { bootApp, goTab, fixture } = require('./support/boot')

// GAP-W2 class 3, the safety net GAP-W4 (#112) needs before it rewrites how
// every button in this app is wired.
//
// All five apps are served from barkernotbob.github.io, so they share one web
// origin and one localStorage. gt_token, pl_token and bb_token sit side by side
// there. A hostile value that reaches script in pool is therefore not a pool
// bug — it hands over grocery's and bank-bonus's GitHub tokens too.
//
// Pool is unusual among the three in that it stores NOTHING locally: every
// value it renders came back over the network from the GitHub Contents API. So
// "data we fetched" and "data the user typed" are the same trust level here,
// and the audit treats both as untrusted. The fixtures below inject at both.

const HOSTILE = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=1<\/script>"'&`

// A different shape of payload. This one does not inject markup; it breaks out
// of the single-quoted ARGUMENT of an inline handler. Task ids are interpolated
// into onclick="markTask('<id>')" and onclick="editTask('<id>')" (index.html
// ~1168) with no escaping at all — not even esc(), which in any case escapes
// & < > " but not '. Substituted in, the attribute reads:
//   markTask('x'),window.__pwned=1,('')
// — a valid comma expression, so the payload runs on click.
//
// Escaping ' as &#39; would NOT fix it: the browser HTML-decodes an event
// handler attribute before parsing it as JavaScript, so the entity turns back
// into a quote. The fix is to stop putting data in inline handlers, which is
// exactly what #112 is for.
const HANDLER_BREAKOUT = `x'),window.__pwned=1,('`

const TABS = ['today', 'test', 'schedule', 'weather', 'history', 'settings']

function configWith(mutate) {
  const config = JSON.parse(fixture('config.json'))
  mutate(config)
  return JSON.stringify(config)
}

// The three checks that together mean "inert": it did not run, it did not
// become a real element, and it did not add a script tag.
async function expectInert(page, baselineScripts) {
  expect(await page.evaluate(() => window.__pwned), 'payload executed').toBeFalsy()
  expect(await page.locator('img[src="x"]').count(), 'payload became a real element').toBe(0)
  expect(
    await page.evaluate(() => document.querySelectorAll('script').length),
    'payload added a script tag'
  ).toBe(baselineScripts)
}

test('a hostile pool name and location render as text', async ({ page }) => {
  const { errors } = await bootApp(page, {
    db: {
      'config.json': configWith((c) => {
        c.pool.name = HOSTILE
        c.pool.location = HOSTILE
      }),
    },
  })
  const baseline = await page.evaluate(() => document.querySelectorAll('script').length)

  for (const tab of TABS) await goTab(page, tab)
  await expectInert(page, baseline)

  // And it is genuinely on screen — inert, not silently swallowed, which would
  // hide the value from the person looking at it.
  await goTab(page, 'today')
  await expect(page.locator('#main')).toContainText('<img src=x onerror=')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a hostile task title and detail render as text', async ({ page }) => {
  const { errors } = await bootApp(page, {
    db: {
      'config.json': configWith((c) => {
        c.tasks[1].title = HOSTILE
        c.tasks[1].detail = HOSTILE
      }),
    },
  })
  const baseline = await page.evaluate(() => document.querySelectorAll('script').length)

  // Task text reaches both the Today due-list and the Schedule routine list.
  for (const tab of TABS) await goTab(page, tab)
  await expectInert(page, baseline)

  await goTab(page, 'schedule')
  await expect(page.locator('#main')).toContainText('<img src=x onerror=')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a hostile checklist step renders as text', async ({ page }) => {
  const { errors } = await bootApp(page, {
    db: {
      'config.json': configWith((c) => {
        c.opening.title = HOSTILE
        c.opening.steps = [HOSTILE, 'A normal step']
      }),
    },
  })
  const baseline = await page.evaluate(() => document.querySelectorAll('script').length)

  await goTab(page, 'schedule')
  await expectInert(page, baseline)
  await expect(page.locator('#main')).toContainText('<img src=x onerror=')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a hostile insight rule renders as text', async ({ page }) => {
  // Insights are the one thing the app invites you to paste in from elsewhere
  // ("paste the AI's RULES block"), so it is the most likely route for someone
  // else's text to reach this app at all.
  const { errors } = await bootApp(page, {
    db: {
      'config.json': configWith((c) => {
        c.insights = [
          { id: 'in_x', label: HOSTILE, advice: HOSTILE, trigger: null, source: 'manual' },
        ]
      }),
    },
  })
  const baseline = await page.evaluate(() => document.querySelectorAll('script').length)

  for (const tab of TABS) await goTab(page, tab)
  await expectInert(page, baseline)
  await goTab(page, 'settings')
  await expect(page.locator('#main')).toContainText('<img src=x onerror=')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a hostile test note renders as text', async ({ page }) => {
  const tests = JSON.parse(fixture('tests.json'))
  tests[1].notes = HOSTILE
  const { errors } = await bootApp(page, { db: { 'tests.json': JSON.stringify(tests) } })
  const baseline = await page.evaluate(() => document.querySelectorAll('script').length)

  for (const tab of TABS) await goTab(page, tab)
  await expectInert(page, baseline)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a hostile value typed into the app is stored and re-rendered inert', async ({ page }) => {
  // The round trip, not just a seeded fixture: type it, save it to GitHub, read
  // it back on a fresh load.
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'settings')
  const baseline = await page.evaluate(() => document.querySelectorAll('script').length)

  await page.fill('#s_name', HOSTILE)
  await page.getByRole('button', { name: 'Save pool' }).click()

  await expect
    .poll(async () => JSON.parse(mock.readFile('db/config.json')).pool.name)
    .toContain('onerror')

  await page.reload()
  await page.locator('#main .card').first().waitFor({ state: 'visible' })
  await goTab(page, 'today')

  await expectInert(page, baseline)
  await expect(page.locator('#main')).toContainText('<img src=x onerror=')
  expect(errors, errors.join('\n')).toEqual([])
})

test('imported AI rules cannot choose their own id', async ({ page }) => {
  // parseInsightArray() assigns uid('in') rather than trusting the pasted id,
  // which is what keeps the paste route clear of the inline-handler breakout
  // below. That is load-bearing and easy to "simplify" away later.
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'settings')

  await page.getByRole('button', { name: /Paste rules|Import/i }).first().click()
  const dialog = page.locator('.modal-ov')
  await dialog.locator('#imp_ta').fill(
    JSON.stringify([{ id: HANDLER_BREAKOUT, label: 'Imported rule', advice: 'Do a thing' }])
  )
  await dialog.getByRole('button', { name: 'Import' }).click()

  await expect
    .poll(async () => JSON.parse(mock.readFile('db/config.json')).insights.length)
    .toBe(2)
  const added = JSON.parse(mock.readFile('db/config.json')).insights.at(-1)
  expect(added.label).toBe('Imported rule')
  expect(added.id).not.toContain('__pwned')
  expect(added.id).toMatch(/^in_/)

  expect(await page.evaluate(() => window.__pwned), 'payload executed').toBeFalsy()
  expect(errors, errors.join('\n')).toEqual([])
})

// KNOWN FAILING — pinned deliberately, do not delete or skip.
//
// This documents the injection GAP-W4 (#112) exists to close, in pool. It is
// marked test.fail(), so the suite is green while the hole is open AND the run
// turns red the moment it is fixed ("expected to fail but passed"), which is
// the prompt to delete this marker.
//
// Not patched here on purpose: pool has ~39 inline handlers and this suite
// audited a handful. Fixing the two sites below would turn this spec green
// across the ~37 it says nothing about, which is worse than an honest failure.
// Confirmed against the app as it stands: window.__pwned is set by the click.
test('a task id cannot break out of an inline click handler', async ({ page }) => {
  // Inside the body on purpose: at file scope test.fail() applies to every test
  // declared after it, which would quietly mark the rest of the file as
  // expected-to-fail.
  test.fail()

  await bootApp(page, {
    db: {
      'config.json': configWith((c) => {
        c.tasks[1].id = HANDLER_BREAKOUT
      }),
    },
  })
  await goTab(page, 'schedule')

  const targets = page.locator('[onclick]')
  const idx = await targets.evaluateAll((els) =>
    els.findIndex((e) => (e.getAttribute('onclick') || '').includes('__pwned'))
  )
  expect(idx, 'the payload should have landed in an onclick attribute').toBeGreaterThanOrEqual(0)
  // Dispatched in-page: a real click can be intercepted at a narrow viewport,
  // which would look like safety this app does not have.
  await targets.nth(idx).evaluate((e) => e.click())

  expect(
    await page.evaluate(() => window.__pwned),
    'payload executed from an inline handler'
  ).toBeFalsy()
})

test('no other app token is reachable from this origin in a test run', async ({ page }) => {
  // Guards the assumption the suite rests on: this rig seeds only pl_* keys, so
  // a payload that did escape could not quietly exfiltrate a real gt_/bb_ token
  // from the test browser and make the suite look safer than the app is.
  await bootApp(page)
  const foreign = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => /^(gt_|bb_)/.test(k))
  )
  expect(foreign).toEqual([])
})
