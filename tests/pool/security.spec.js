const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')
const { bootApp, goTab, fixture } = require('./support/boot')

// The app's own <script> tags, counted from the file on disk rather than from
// the live page. Counting the live page AFTER the hostile fixture has already
// rendered would fold an injected script into the baseline, and the assertion
// could never fail — which is worse than not making it.
const APP_HTML = fs.readFileSync(
  path.join(__dirname, '..', '..', 'quartz', 'static', 'pool', 'index.html'),
  'utf8'
)
const APP_SCRIPTS = (APP_HTML.match(/<script\b/g) || []).length

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

test('a hostile pool name and location render as text', async ({ page }) => {
  const { errors } = await bootApp(page, {
    db: {
      'config.json': configWith((c) => {
        c.pool.name = HOSTILE
        c.pool.location = HOSTILE
      }),
    },
  })

  for (const tab of TABS) await goTab(page, tab)
  await expectInert(page)

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

  // Task text reaches both the Today due-list and the Schedule routine list.
  for (const tab of TABS) await goTab(page, tab)
  await expectInert(page)

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

  await goTab(page, 'schedule')
  await expectInert(page)
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

  for (const tab of TABS) await goTab(page, tab)
  await expectInert(page)
  await goTab(page, 'settings')
  await expect(page.locator('#main')).toContainText('<img src=x onerror=')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a hostile test note renders as text', async ({ page }) => {
  const tests = JSON.parse(fixture('tests.json'))
  tests[1].notes = HOSTILE
  const { errors } = await bootApp(page, { db: { 'tests.json': JSON.stringify(tests) } })

  for (const tab of TABS) await goTab(page, tab)
  await expectInert(page)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a hostile value typed into the app is stored and re-rendered inert', async ({ page }) => {
  // The round trip, not just a seeded fixture: type it, save it to GitHub, read
  // it back on a fresh load.
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'settings')

  await page.fill('#s_name', HOSTILE)
  await page.getByRole('button', { name: 'Save pool' }).click()

  await expect
    .poll(async () => JSON.parse(mock.readFile('db/config.json')).pool.name)
    .toContain('onerror')

  await page.reload()
  await page.locator('#main .card').first().waitFor({ state: 'visible' })
  await goTab(page, 'today')

  await expectInert(page)
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

// The injection GAP-W4 (#112) existed to close, in pool. Closed by the
// delegated-dispatch rewrite: task ids now travel in data-a1 and the action
// name is looked up in a fixed table, so no value reaches an executable
// position.
//
// This was pinned test.fail() while the hole was open, on the theory that the
// run would turn red the moment it was fixed. It would not have. The first
// assertion required the payload to LAND in an onclick attribute, and after
// the fix no such attribute exists — so the test still failed, just for a new
// reason, and test.fail() went on reporting green. The completion check was
// inert. Rewritten below to assert the safety property directly.
test('a hostile task id cannot reach an executable position', async ({ page }) => {
  await bootApp(page, {
    db: {
      'config.json': configWith((c) => {
        c.tasks[1].id = HANDLER_BREAKOUT
      }),
    },
  })
  await goTab(page, 'schedule')

  // The structural guarantee, not a property of this one payload: with no
  // inline handler anywhere, there is no executable position for any value to
  // break into.
  expect(await page.locator('[onclick]').count(), 'an inline handler came back').toBe(0)

  // The id must still arrive intact as DATA. Asserting only "nothing executed"
  // would also pass if the rewrite had simply dropped the button.
  const btn = page.locator(`[data-action="markTask"][data-a1=${JSON.stringify(HANDLER_BREAKOUT)}]`)
  expect(await btn.count(), 'the hostile id should still render a working button').toBeGreaterThan(0)

  // Dispatched in-page: a real click can be intercepted at a narrow viewport,
  // which would look like safety this app does not have.
  await btn.first().evaluate((e) => e.click())

  expect(await page.evaluate(() => window.__pwned), 'payload executed').toBeFalsy()
})

// The rewrite above is only durable if the attributes stay gone. Grocery was
// hardened the same way and stayed that way because a test said so; pool had
// ~39 handlers precisely because nothing was watching.
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
