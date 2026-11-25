// Once the pool is closed the daily reminder emails stop, unless there's a good
// reason. Found live: a test logged on 2026-10-14 (nine days after the closing
// date) re-sent its advice every day for six weeks, and winter rain sent alerts.
//
// Runs the real reminders.mjs under Node, alone in an empty folder as the
// workflow's `curl` leaves it, with the clock and the weather pinned
// (support/pin-run.mjs). `has_due` is what the workflow reads to decide whether to email.
const { test, expect } = require('@playwright/test')
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const { fixture } = require('./support/boot')

const SCRIPT = path.join(__dirname, '..', '..', 'quartz', 'static', 'pool', 'reminders.mjs')
const CHEM_URL = 'http://127.0.0.1:5176/static/shared/pool-chem.js'
const PIN = pathToFileURL(path.join(__dirname, 'support', 'pin-run.mjs')).href

let dir
test.beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-closed-'))
  fs.mkdirSync(path.join(dir, 'db'))
  fs.copyFileSync(SCRIPT, path.join(dir, 'reminders.mjs'))
  put('config.json', fixture('config.json'))
})
test.afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const put = (f, text) => fs.writeFileSync(path.join(dir, 'db', f), text)
const waterTest = (date) => put('tests.json', JSON.stringify([{ id: `t_${date}`, date, mode: 'num', levels: {}, nums: { fc: 0.5, ta: 40 } }]))
const logSeason = (task, date) => put('log.json', JSON.stringify([{ id: 'l1', at: `${date}T16:00:00.000Z`, kind: 'season', task, title: task }]))

// One daily run. Feed history carries over to the next, as the commit does live.
function run(today) {
  const env = { ...process.env, POOL_CHEM_URL: CHEM_URL, FAKE_TODAY: today, MAIL_FALLBACK: 'me@example.com' }
  delete env.GITHUB_OUTPUT
  const out = execFileSync(process.execPath, ['--import', PIN, 'reminders.mjs'], { cwd: dir, env, encoding: 'utf8', stdio: 'pipe', timeout: 60_000 })
  return {
    emails: /^has_due=true$/m.test(out),
    subject: out.match(/^subject=(.*)$/m)[1],
    body: fs.readFileSync(path.join(dir, 'out', 'email_body.html'), 'utf8'),
  }
}

test('an open pool still repeats its reminders daily', () => {
  waterTest('2026-07-14')
  expect(run('2026-07-15').subject).toMatch(/task.* due.*test advice.*rain alert/)
  expect(run('2026-07-16').subject).toMatch(/task.* due.*test advice.*rain alert/)
})

test('after the closing date, a test that needs attention emails once, then nothing', () => {
  waterTest('2026-10-14')
  expect(run('2026-10-15').subject).toBe('🏊 Pool: test advice')
  expect(run('2026-10-16').emails).toBe(false)
  expect(run('2026-11-24').emails).toBe(false)
})

test('a test already sent while open does not email again once closed', () => {
  waterTest('2026-10-01')
  expect(run('2026-10-05').emails).toBe(true)
  expect(run('2026-10-06').emails).toBe(false)
})

test('marking the closing checklist done stops emails before the closing date', () => {
  waterTest('2026-09-20')
  expect(run('2026-09-24').subject).toMatch(/due.*season heads-up/)
  logSeason('close', '2026-09-25')
  expect(run('2026-09-25').emails).toBe(false)
  // Last year's closing doesn't silence this year.
  logSeason('close', '2025-09-25')
  expect(run('2026-09-26').emails).toBe(true)
})

test('the spring-opening heads-up emails once, without last season’s test advice', () => {
  waterTest('2026-10-14')
  run('2026-10-15')
  expect(run('2027-03-29').emails).toBe(false)
  const heads = run('2027-03-30')
  expect(heads.subject).toBe('🏊 Pool: season heads-up')
  expect(heads.body).not.toContain('From your last test')
  expect(run('2027-03-31').emails).toBe(false)
  expect(run('2027-04-20').emails).toBe(true) // open: routine tasks resume
})

test('once reopened, last season’s test advice stays out until a new test is logged', () => {
  waterTest('2026-10-14')
  const reopened = run('2027-04-20')
  expect(reopened.subject).toMatch(/due/)
  expect(reopened.subject).not.toContain('test advice')
  expect(reopened.body).not.toContain('From your last test')
  waterTest('2027-04-21')
  expect(run('2027-04-21').subject).toContain('test advice')
  expect(run('2027-04-22').subject).toContain('test advice')
})

test('marking the opening checklist done early turns emails back on', () => {
  logSeason('open', '2027-04-10')
  waterTest('2027-04-11')
  expect(run('2027-04-11').subject).toMatch(/test advice/)
  expect(run('2027-04-12').subject).toMatch(/test advice/)
  expect(run('2027-04-12').subject).not.toContain('season heads-up')
})

test('a year-round task still emails while closed, once per due date', () => {
  const c = JSON.parse(fixture('config.json'))
  c.tasks = [{ id: 'cover', title: 'Check the cover', cadence: 'monthly', season: 'all', last: '2026-11-01' }]
  put('config.json', JSON.stringify(c))
  expect(run('2026-11-30').emails).toBe(false)
  expect(run('2026-12-01').subject).toBe('🏊 Pool: 1 task due')
  expect(run('2026-12-02').emails).toBe(false)
})
