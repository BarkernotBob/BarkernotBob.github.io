// Test bootstrap for Pool Care (GAP-W2, issue #109).
//
// Pool is NOT local-first. Unlike bank-bonus, which keeps a whole localStorage
// database and only talks to GitHub once a token is connected, pool stores
// nothing but the sign-in itself (pl_repo / pl_token / pl_login / pl_method /
// pl_device) and reads every byte of data from the GitHub Contents API. There
// is no offline mode to test. So every booted test here runs against
// tests/shared/mock-github.js — there is no bootApp()/bootSynced() split.
//
// Three things are pinned so the suite is deterministic:
//
//   1. The clock, to 2026-07-15. Pool's whole Today screen is a function of the
//      date — which tasks are due, whether it is in season, whether it is peak
//      summer, and whether the open/close prompt shows. Left on the real clock
//      this suite would quietly change meaning every day and go red on
//      2026-10-06 when the season closes.
//   2. The weather. The app calls Open-Meteo on every Today and Weather render.
//   3. The fonts. Google Fonts is a <link> in the head; unreachable in CI it
//      logs a resource error and the clean-console assertion fails for a reason
//      that has nothing to do with the app.
const fs = require('fs')
const path = require('path')
const { installGitHubMock } = require('../../shared/mock-github')

const APP_URL = '/static/pool/index.html'
const FIXTURES = path.join(__dirname, '..', 'fixtures', 'db')

// Pinned "today". In season (04-20..10-05) and in peak (06-01..08-31), so the
// season-dependent branches are the ones a summer user actually sees. Noon UTC:
// the app derives its date with toISOString().slice(0,10), and the config below
// forces the browser to UTC, so this is 2026-07-15 with no edge to fall off.
const TODAY = '2026-07-15'
const FIXED_TIME = new Date(`${TODAY}T12:00:00Z`)

// The three widths CLAUDE.md calls out: phone, tablet, desktop.
const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 900, height: 1000 },
  desktop: { width: 1300, height: 900 },
}

// The sign-in state pool needs to consider itself configured. isConfigured() is
// just `LS.repo && LS.token`, so these two are what separate the app from the
// setup screen.
const SIGNED_IN = {
  pl_repo: 'testuser/pool-data',
  pl_token: 'ghp_test_token',
  pl_login: 'testuser',
  pl_method: 'token',
  pl_device: 'Test Device',
}

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8')
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

// Deterministic synthetic weather covering past_days=30 through tomorrow, in
// the exact shape getWeather() destructures. Dry for most of the window with
// one wet day, so the rain-dependent copy has something to say.
function weatherPayload() {
  const dayMs = 86400000
  const start = FIXED_TIME.getTime() - 30 * dayMs
  const days = 32
  const daily = { time: [], precipitation_sum: [], temperature_2m_max: [], temperature_2m_min: [] }
  const hourly = { time: [], precipitation: [], temperature_2m: [], relative_humidity_2m: [] }
  for (let d = 0; d < days; d++) {
    const date = new Date(start + d * dayMs).toISOString().slice(0, 10)
    const wet = d === 27 // one identifiable wet day, three days before "today"
    daily.time.push(date)
    daily.precipitation_sum.push(wet ? 1.2 : 0)
    daily.temperature_2m_max.push(86 + (d % 3))
    daily.temperature_2m_min.push(65 + (d % 3))
    for (let h = 0; h < 24; h++) {
      hourly.time.push(`${date}T${String(h).padStart(2, '0')}:00`)
      hourly.precipitation.push(wet && h >= 14 && h < 18 ? 0.3 : 0)
      hourly.temperature_2m.push(70 + (h % 12))
      hourly.relative_humidity_2m.push(55 + (h % 10))
    }
  }
  return { daily, hourly }
}

// Everything the app reaches for that is not GitHub. Kept in one place so a new
// outbound call shows up as a test failure rather than a silent live request.
async function stubExternals(page) {
  const external = []
  await page.route('**://api.open-meteo.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(weatherPayload()) })
  )
  await page.route('**://geocoding-api.open-meteo.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [{ latitude: 39.7817, longitude: -89.6501, name: 'Springfield', admin1: 'Illinois', country_code: 'US' }],
      }),
    })
  )
  // Fonts: fulfilled empty rather than aborted, so no failed-request noise.
  await page.route('**://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '' })
  )
  await page.route('**://fonts.gstatic.com/**', (route) => route.fulfill({ status: 200, body: '' }))
  // Anything else off-origin is recorded and blocked — the suite asserts this
  // list stays empty, which is how a newly-added third-party call gets noticed.
  await page.route('**://*/**', (route, req) => {
    const url = req.url()
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) return route.continue()
    if (/api\.github\.com|open-meteo\.com|fonts\.(googleapis|gstatic)\.com/.test(url)) return route.fallback()
    external.push(url)
    return route.abort()
  })
  return external
}

async function ready(page) {
  // The nav is static markup, so it is visible before anything has loaded and
  // proves nothing. #main is what show() fills, and it holds a .spin card while
  // the GitHub read is in flight.
  await page.locator('#main .card').first().waitFor({ state: 'visible' })
  await page.waitForFunction(() => {
    const m = document.querySelector('#main')
    return m && !m.querySelector('.spin')
  })
}

// Boot signed in, against the mock, with the clock and weather pinned.
//
//   opts.viewport   one of VIEWPORTS (default mobile — this app is phone-first)
//   opts.seed       extra/overriding localStorage keys
//   opts.db         { 'config.json': '<json>' } to override a fixture file
//   opts.signedOut  boot with no token, to land on the setup screen
async function bootApp(page, { viewport = VIEWPORTS.mobile, seed = {}, db = {}, signedOut = false } = {}) {
  const errors = watchConsole(page)
  await page.setViewportSize(viewport)
  await page.clock.setFixedTime(FIXED_TIME)

  const store = signedOut ? { ...seed } : { ...SIGNED_IN, ...seed }
  // addInitScript runs on EVERY navigation, a reload included. Seed only what
  // is missing, or a test that reloads to prove something persisted would have
  // its own saved value overwritten by the fixture on the way back in. (Learned
  // the hard way on tests/bank-bonus — see its README.)
  await page.addInitScript((s) => {
    for (const [k, v] of Object.entries(s)) {
      if (localStorage.getItem(k) === null) localStorage.setItem(k, v)
    }
  }, store)

  const external = await stubExternals(page)
  const mock = await installGitHubMock(page, { fixturesDir: FIXTURES })
  // Fixture overrides land as a commit BEFORE the first navigation, so the app's
  // opening read already sees them. (The mock has no seed-time override hook;
  // injectRemote is its supported way to advance head, and pre-goto it is
  // indistinguishable from the file having always looked like this.)
  const mods = {}
  for (const [name, text] of Object.entries(db)) mods[`db/${name}`] = text
  if (Object.keys(mods).length) mock.injectRemote(mods)
  await page.goto(APP_URL)
  await ready(page)
  return { errors, mock, external, VIEWPORTS, TODAY }
}

// Switch tabs and wait for that tab to be the active one and its render to
// settle. show() is async — it awaits loadAll() on the first call — so clicking
// and asserting immediately races the render.
async function goTab(page, tab) {
  await page.click(`nav button[data-tab="${tab}"]`)
  await page.locator(`nav button[data-tab="${tab}"].active`).waitFor({ state: 'visible' })
  await ready(page)
}

module.exports = {
  bootApp,
  goTab,
  ready,
  fixture,
  weatherPayload,
  APP_URL,
  VIEWPORTS,
  FIXTURES,
  TODAY,
  FIXED_TIME,
  SIGNED_IN,
}
