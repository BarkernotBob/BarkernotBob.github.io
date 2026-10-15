// Issue #141 — Settings shows where reminder emails actually go.
//
// The app can't read the pool-data workflow's MAIL_USERNAME secret, so the
// daily run (reminders.mjs) records the address it used in db/feed-state.json
// as `mail: {to, source}`. Settings reads that and shows one of three lines:
//   - no record yet           → "not known yet. It appears after the next daily email."
//   - sent to the secret      → "<address> (default from GitHub)"
//   - sent to the saved email → "<address>"
// Both halves are covered: the script writing the record (run under Node, alone
// in an empty folder as the workflow's `curl` leaves it), and the app showing it.
const { test, expect } = require('@playwright/test')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { bootApp, goTab, fixture, VIEWPORTS } = require('./support/boot')

const SCRIPT = path.join(__dirname, '..', '..', 'quartz', 'static', 'pool', 'reminders.mjs')
const CHEM_URL = 'http://127.0.0.1:5176/static/shared/pool-chem.js'

const NOT_KNOWN = 'Reminders go to: not known yet. It appears after the next daily email.'
const feed = (mail) => JSON.stringify({ items: [], mail })
const withEmail = (email) => {
  const c = JSON.parse(fixture('config.json'))
  c.email = email
  return JSON.stringify(c)
}

// Run reminders.mjs the way Actions does, in `dir`, and return feed-state.json.
function runReminders(dir, { configJson, fallback }) {
  fs.mkdirSync(path.join(dir, 'db'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'db', 'config.json'), configJson)
  fs.copyFileSync(SCRIPT, path.join(dir, 'reminders.mjs'))
  const env = { ...process.env, POOL_CHEM_URL: CHEM_URL }
  delete env.GITHUB_OUTPUT
  delete env.MAIL_FALLBACK
  if (fallback) env.MAIL_FALLBACK = fallback
  execFileSync(process.execPath, ['reminders.mjs'], { cwd: dir, env, stdio: 'pipe', timeout: 60_000 })
  const p = path.join(dir, 'db', 'feed-state.json')
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null
}

test('the daily run records the address it sends to, and keeps the feed history', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-mailto-'))
  try {
    // An existing feed-state in the OLD shape: a bare array of feed items.
    const old = [{ guid: 'pool-task-old-2026-07-01', title: 'Pool: old', body: 'x', date: '2026-07-01', pubDate: 'Wed, 01 Jul 2026 11:00:00 GMT' }]
    fs.mkdirSync(path.join(dir, 'db'))
    fs.writeFileSync(path.join(dir, 'db', 'feed-state.json'), JSON.stringify(old))

    // Email box empty → the secret, marked as the default.
    let s = runReminders(dir, { configJson: withEmail(''), fallback: 'secret@example.com' })
    expect(s.mail).toMatchObject({ to: 'secret@example.com', source: 'default' })
    expect(s.items.map((i) => i.guid)).toContain('pool-task-old-2026-07-01')

    // An address saved in Settings wins, and is marked as from Settings.
    s = runReminders(dir, { configJson: withEmail('  me@example.com '), fallback: 'secret@example.com' })
    expect(s.mail).toMatchObject({ to: 'me@example.com', source: 'settings' })
    expect(s.items.map((i) => i.guid)).toContain('pool-task-old-2026-07-01')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('Settings says the address is not known before any run has recorded one', async ({ page }) => {
  // No feed-state.json at all, as in a fresh data repo.
  const { errors } = await bootApp(page)
  await goTab(page, 'settings')
  await expect(page.locator('#mailTo')).toHaveText(NOT_KNOWN)
  expect(errors, errors.join('\n')).toEqual([])
})

test('Settings says not known yet for an older feed-state with no address in it', async ({ page }) => {
  await bootApp(page, { db: { 'feed-state.json': '[]' } })
  await goTab(page, 'settings')
  await expect(page.locator('#mailTo')).toHaveText(NOT_KNOWN)
})

test('Settings shows the GitHub default when the run fell back to it', async ({ page }) => {
  await bootApp(page, { db: { 'feed-state.json': feed({ to: 'secret@example.com', source: 'default', since: '2026-07-14' }) } })
  await goTab(page, 'settings')
  await expect(page.locator('#mailTo')).toHaveText('Reminders go to: secret@example.com (default from GitHub)')
})

test('Settings shows the saved address, without "(default)", when the run used it', async ({ page }) => {
  await bootApp(page, {
    db: { 'config.json': withEmail('me@example.com'), 'feed-state.json': feed({ to: 'me@example.com', source: 'settings', since: '2026-07-14' }) },
  })
  await goTab(page, 'settings')
  await expect(page.locator('#mailTo')).toHaveText('Reminders go to: me@example.com')
})

for (const [label, viewport] of [['390px', VIEWPORTS.mobile], ['1300px', VIEWPORTS.desktop]]) {
  test(`saving an email moves nothing in Settings at ${label}`, async ({ page }) => {
    await bootApp(page, { viewport, db: { 'feed-state.json': feed({ to: 'secret@example.com', source: 'default', since: '2026-07-14' }) } })
    await goTab(page, 'settings')
    const boxes = () =>
      page.evaluate(() =>
        ['#s_email', '#mailTo', '[data-action="saveEmail"]', '[data-action="saveSeason"]'].map((sel) => {
          const r = document.querySelector(sel).getBoundingClientRect()
          return [sel, Math.round(r.top + window.scrollY), Math.round(r.left + window.scrollX), Math.round(r.width), Math.round(r.height)]
        }),
      )
    const before = await boxes()
    await page.fill('#s_email', 'a.rather.long.address.for.wrapping@example.com')
    await page.click('[data-action="saveEmail"]')
    await expect(page.locator('#toast')).toHaveText('Email saved')
    expect(await boxes()).toEqual(before)
  })
}
