// Issue #142 — the app and the daily email must give the SAME advice.
//
// Both now import one module (quartz/static/shared/pool-chem.js). Before that,
// each held its own ~200-line copy of the chemistry, and the copies drifted:
// the email skipped the app's config upgrade, so an older config (missing
// target ranges, renamed chemical keys, a blanked range) was judged one way on
// the phone and another way in the inbox.
//
// Each case below runs the real reminders.mjs under plain Node, the way the
// pool-data workflow does: the script is copied ALONE into an empty folder (the
// workflow only `curl`s that one file), so it has to fetch the shared module
// over HTTP — here from this suite's own web server via POOL_CHEM_URL. Then the
// app boots on the same config + tests and the two lists of advice are
// compared, card for card. The next drift fails here instead of shipping.
const { test, expect } = require('@playwright/test')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { bootApp, fixture } = require('./support/boot')

const SCRIPT = path.join(__dirname, '..', '..', 'quartz', 'static', 'pool', 'reminders.mjs')
const CHEM_URL = 'http://127.0.0.1:5176/static/shared/pool-chem.js'

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

// Run the email script the way Actions does and return its advice cards as
// "Name — display: text" lines, in the order the email lists them.
function emailAdvice(configJson, testsJson) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-remind-'))
  try {
    fs.mkdirSync(path.join(dir, 'db'))
    fs.writeFileSync(path.join(dir, 'db', 'config.json'), configJson)
    fs.writeFileSync(path.join(dir, 'db', 'tests.json'), testsJson)
    fs.copyFileSync(SCRIPT, path.join(dir, 'reminders.mjs'))
    const env = { ...process.env, POOL_CHEM_URL: CHEM_URL }
    delete env.GITHUB_OUTPUT
    execFileSync(process.execPath, ['reminders.mjs'], { cwd: dir, env, stdio: 'pipe', timeout: 60_000 })
    const html = fs.readFileSync(path.join(dir, 'out', 'email_body.html'), 'utf8')
    const re = /<b>([^<]*)<\/b><br><span style="color:#444;font-size:14px">([^<]*)<\/span><\/div>/g
    return [...html.matchAll(re)].map((m) => `${decode(m[1])}: ${decode(m[2])}`)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// The app's "All readings & detail" list for the latest test on Today, minus
// the in-range readings (which the email leaves out).
async function appAdvice(page) {
  const card = page.locator('.card', { has: page.locator('h2', { hasText: 'Latest test' }) })
  return card.locator('details .rec.warn, details .rec.danger').evaluateAll((els) =>
    els.map((e) => `${e.querySelector('b').textContent}: ${e.querySelector('.small').textContent}`),
  )
}

async function expectSameAdvice(page, configJson, testsJson) {
  const email = emailAdvice(configJson, testsJson)
  const { errors } = await bootApp(page, { db: { 'config.json': configJson, 'tests.json': testsJson } })
  const app = await appAdvice(page)
  expect(app.length, 'the record should produce some advice, or this proves nothing').toBeGreaterThan(0)
  expect(email).toEqual(app)
  expect(errors, errors.join('\n')).toEqual([])
  return app
}

const withConfig = (mutate) => {
  const c = JSON.parse(fixture('config.json'))
  mutate(c)
  return JSON.stringify(c)
}
const oneTest = (t) => JSON.stringify([{ id: 't_parity', date: '2026-07-14', at: '2026-07-14T13:00:00.000Z', by: 'testuser', notes: '', levels: {}, nums: {}, ...t }])

test('the fixture record gets the same advice in the email as in the app', async ({ page }) => {
  // The fixture config is an OLD one: legacy `chlorine_granular` key, and no
  // target range for total chlorine or bromine.
  await expectSameAdvice(page, fixture('config.json'), fixture('tests.json'))
})

test('a strip test that makes readings talk to each other matches', async ({ page }) => {
  // Very low free chlorine (a shock), total chlorine above it (chloramines —
  // must point at the shock, not dose twice), high hardness (steers chlorine to
  // liquid), high pH (a shopping note), low CYA.
  const config = withConfig((c) => {
    c.chemicals = { onHand: { liquid_chlorine: true, cal_hypo: true, trichlor_tabs: true, alkalinity_up: true, soda_ash: true } }
  })
  const app = await expectSameAdvice(
    page,
    config,
    oneTest({ mode: 'qual', levels: { fc: 'very low', tc: 'low', ch: 'high', ph: 'high', cya: 'low', br: 'high' } }),
  )
  expect(app.join('\n')).toContain('liquid chlorine')
})

test('a blanked target range and a missing inventory are handled the same on both sides', async ({ page }) => {
  // The drift #142 found: the email took any two-element range at face value
  // (so a blanked [null, null] compared every reading against NaN) and never
  // ran the app's config upgrade.
  const config = withConfig((c) => {
    c.targets.fc = { range: [null, null] }
    c.targets.ta = { range: [90, 110] }
    delete c.targets.ch
    delete c.chemicals
  })
  await expectSameAdvice(
    page,
    config,
    oneTest({ mode: 'num', nums: { fc: 0.8, tc: 2.4, ta: 85, ch: 150, ph: 7.9, po4: 400 } }),
  )
})
