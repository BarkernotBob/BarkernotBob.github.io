// Test bootstrap for the Bank Bonus Tracker (GAP-W2).
//
// bank-bonus is local-first: unless a GitHub token is connected it reads and
// writes localStorage, and never touches the network. So most tests seed the
// browser store directly from the fixtures and run with GitHub blocked outright
// — faster, and it exercises the path the app actually defaults to.
//
// bootSynced() is the other half: it flips the app into 'github' mode and
// installs the shared mock, for the sync flow specifically.
const fs = require('fs')
const path = require('path')
const { installGitHubMock } = require('../../shared/mock-github')

const APP_URL = '/static/bank-bonus/index.html'
const FIXTURES = path.join(__dirname, '..', 'fixtures', 'db')

// The three widths CLAUDE.md calls out: phone, tablet, desktop.
const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 900, height: 1000 },
  desktop: { width: 1300, height: 900 },
}

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf8')
}

// Everything the app reads out of localStorage on a local-mode boot.
function localSeed(overrides = {}) {
  return {
    bb_store_mode: 'local',
    bb_seeded: '1', // skip the starter-catalog seeding, so tests see only fixtures
    bb_me: 'Me',
    'bb_local_db/config.json': fixture('config.json'),
    'bb_local_db/accounts.json': fixture('accounts.json'),
    'bb_local_db/offers.json': fixture('offers.json'),
    ...overrides,
  }
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

async function ready(page) {
  // #main is populated by init(); the nav only appears once a section rendered.
  await page.locator('.nav-btn[data-tab="today"]').waitFor({ state: 'visible' })
  await page.locator('.section.active').first().waitFor({ state: 'visible' })
}

// Boot in local mode with the fixtures seeded. Any api.github.com request is a
// failure of the local-first promise, so they are recorded and aborted.
async function bootApp(page, { viewport = VIEWPORTS.mobile, seed = {} } = {}) {
  const errors = watchConsole(page)
  const githubCalls = []
  await page.setViewportSize(viewport)
  // addInitScript runs on EVERY navigation, a reload included. Seed only what
  // is missing, or a test that reloads to prove something persisted would have
  // its own saved value overwritten by the fixture on the way back in.
  await page.addInitScript((store) => {
    for (const [k, v] of Object.entries(store)) {
      if (localStorage.getItem(k) === null) localStorage.setItem(k, v)
    }
  }, localSeed(seed))
  await page.route('**://api.github.com/**', (route, req) => {
    githubCalls.push(req.url())
    return route.abort()
  })
  await page.goto(APP_URL)
  await ready(page)
  return { errors, githubCalls, VIEWPORTS }
}

// Boot with GitHub sync on, backed by the shared mock.
async function bootSynced(page, { viewport = VIEWPORTS.mobile, mock: mockOpts = {} } = {}) {
  const errors = watchConsole(page)
  await page.setViewportSize(viewport)
  await page.addInitScript(() => {
    // Same "only if missing" rule as bootApp — see the note there.
    const seed = {
      bb_store_mode: 'github',
      bb_repo: 'testuser/bank-bonus-data',
      bb_token: 'ghp_test_token',
      bb_login: 'testuser',
      bb_me: 'Me',
      bb_method: 'token',
      bb_seeded: '1',
    }
    for (const [k, v] of Object.entries(seed)) {
      if (localStorage.getItem(k) === null) localStorage.setItem(k, v)
    }
  })
  const mock = await installGitHubMock(page, { fixturesDir: FIXTURES, ...mockOpts })
  await page.goto(APP_URL)
  await ready(page)
  return { errors, mock, VIEWPORTS }
}

// Switch tabs and wait for that section to be the active one.
async function goTab(page, tab) {
  await page.click(`.nav-btn[data-tab="${tab}"]`)
  await page.locator(`#section-${tab}.active`).waitFor({ state: 'visible' })
}

module.exports = { bootApp, bootSynced, goTab, fixture, localSeed, APP_URL, VIEWPORTS, FIXTURES }
