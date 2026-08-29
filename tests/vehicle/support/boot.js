// Test bootstrap for Driveline, the vehicle cost tool (GAP-W2, issue #109).
//
// The last and simplest of the three rigs. Vehicle is the opposite of pool:
// where pool keeps nothing locally and reads everything from GitHub, vehicle
// keeps EVERYTHING locally and talks to nothing at all. One localStorage key
// (`driveline.v1`) holds the whole app state, there is no token, no sync and
// no API — so there is no mock here, and `boot.spec.js` can assert the app
// makes no outbound request whatsoever.
//
// Nor is there a clock to pin: the app contains no `new Date()` anywhere. Its
// model-year rows are literal numbers in the data, so a run today and a run
// next year compute the same figures.
const fs = require('fs')
const path = require('path')

const APP_URL = '/static/vehicle/index.html'
const STORAGE_KEY = 'driveline.v1'
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'state.json')

// The three widths CLAUDE.md calls out: phone, tablet, desktop.
const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 900, height: 1000 },
  desktop: { width: 1300, height: 900 },
}

function fixtureState() {
  return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
}

// Collect console errors and uncaught page errors so any test can assert the
// console stayed clean.
function watchConsole(page) {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}

// Boot with the fixture state seeded.
//
//   opts.viewport   one of VIEWPORTS (default mobile — this app is phone-first)
//   opts.state      replace the seeded state wholesale
//   opts.mutate     receives the fixture state to edit before seeding
//   opts.fresh      seed nothing, so the app falls back to its 16 sample cars
async function bootApp(page, { viewport = VIEWPORTS.mobile, state, mutate, fresh = false } = {}) {
  const errors = watchConsole(page)
  await page.setViewportSize(viewport)

  if (!fresh) {
    const seed = state || fixtureState()
    if (mutate) mutate(seed)
    // addInitScript runs on EVERY navigation, a reload included. Seed only if
    // the key is missing, or a test that reloads to prove something persisted
    // has its own saved value overwritten by the fixture on the way back in —
    // which looks exactly like the app failing to save. (Learned on
    // tests/bank-bonus; it is the single most expensive trap in these rigs.)
    await page.addInitScript(
      ([key, value]) => {
        if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
      },
      [STORAGE_KEY, JSON.stringify(seed)]
    )
  }

  // Fonts are fulfilled empty rather than aborted: unreachable in CI they log a
  // resource error and the clean-console assertion fails for a reason that has
  // nothing to do with the app.
  await page.route('**://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' })
  )
  await page.route('**://fonts.gstatic.com/**', (route) => route.fulfill({ status: 200, body: '' }))

  // Everything else off-origin is recorded and blocked. This app is supposed to
  // talk to nothing; the list below is what proves it still doesn't.
  const external = []
  await page.route('**://*/**', (route, req) => {
    const url = req.url()
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) return route.continue()
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return route.fallback()
    external.push(url)
    return route.abort()
  })

  await page.goto(APP_URL)
  await ready(page)
  return { errors, external, VIEWPORTS }
}

async function ready(page) {
  // render() is synchronous and fills #app, so one visible view is enough —
  // there is no fetch to wait on anywhere in this app.
  await page.locator('#app .view').first().waitFor({ state: 'visible' })
}

// Switch tabs and wait for that tab to be the active one.
async function goTab(page, tab) {
  await page.click(`#tabnav button[data-tab="${tab}"]`)
  await page.locator(`#tabnav button[data-tab="${tab}"].on`).waitFor({ state: 'visible' })
  await ready(page)
}

// Read the saved state back out of the browser, to assert a change persisted.
async function stored(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || 'null'), STORAGE_KEY)
}

module.exports = {
  bootApp,
  goTab,
  ready,
  stored,
  fixtureState,
  APP_URL,
  STORAGE_KEY,
  VIEWPORTS,
}
