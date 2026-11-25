const { test, expect } = require('@playwright/test')
const fs = require('fs')
const path = require('path')
const { bootApp } = require('./support/boot')

// Issue #12: anything whose date has passed stays on Today, marked overdue,
// until it is dealt with. The clock is pinned so the fixtures land late:
//   a_planned_1  plannedOpen 2026-09-04  -> 82 days overdue on 2026-11-25
//   a_closed_1   reopenAfter 2026-11-01  -> eligible to reopen since 11/01/26

const NOW = new Date('2026-11-25T17:00:00Z') // midday in New York
const FIXTURE = path.join(__dirname, 'fixtures', 'db', 'accounts.json')

const accountsInStore = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('bb_local_db/accounts.json') || '[]'))

function accountsWithReminder() {
  const accounts = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const a = accounts.find((x) => x.id === 'a_open_1')
  a.reminders = [{ id: 'r_late', date: '2026-11-20', note: 'Move the DD back', done: false }]
  return JSON.stringify(accounts)
}

async function bootLate(page, seed) {
  await page.clock.setFixedTime(NOW)
  // Record what the app paints on the Home Screen icon.
  await page.addInitScript(() => {
    window.__badge = null
    navigator.setAppBadge = (n) => { window.__badge = n; return Promise.resolve() }
    navigator.clearAppBadge = () => { window.__badge = 0; return Promise.resolve() }
  })
  return bootApp(page, seed ? { seed } : {})
}

test('Today: a planned account past its open date stays, marked overdue', async ({ page }) => {
  const { errors } = await bootLate(page)
  const today = page.locator('#section-today')
  await expect(today).not.toContainText('Nothing due today')
  const toOpen = today.locator('.card', { hasText: 'Accounts to Open' })
  await expect(toOpen).toContainText('Planned Provident')
  await expect(toOpen.locator('.late')).toHaveText('82 days overdue')
  expect(errors).toEqual([])
})

test('Today: a reopen date that passed shows until dismissed, and the dismissal sticks', async ({ page }, testInfo) => {
  const { errors } = await bootLate(page)
  const today = page.locator('#section-today')
  const reopen = today.locator('.card', { hasText: 'Eligible to Reopen' })
  await expect(reopen).toContainText('Closed Cooperative')
  await expect(reopen).toContainText('Eligible since 11/01/26')
  await page.screenshot({ path: testInfo.outputPath('today-overdue.png'), fullPage: true })
  await testInfo.attach('today-overdue', { path: testInfo.outputPath('today-overdue.png'), contentType: 'image/png' })

  // The row settles in place (no reflow) and the icon badge drops at once.
  const before = await page.evaluate(() => window.__badge)
  const dismiss = reopen.getByRole('button', { name: 'Dismiss' })
  await dismiss.click()
  await expect(reopen.getByRole('button', { name: 'Dismissed' })).toBeDisabled()
  await expect.poll(() => page.evaluate(() => window.__badge)).toBe(before - 1)
  await expect.poll(async () =>
    (await accountsInStore(page)).find((a) => a.id === 'a_closed_1').reopenDismissedOn
  ).toBe('2026-11-25')

  await page.reload()
  await expect(page.locator('#section-today')).not.toContainText('Eligible to Reopen')
  expect(errors).toEqual([])
})

test('Today: planning a new account at the same bank clears the reopen item', async ({ page }) => {
  const accounts = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const old = accounts.find((x) => x.id === 'a_closed_1')
  accounts.push({ ...old, id: 'a_again', status: 'planned',
    dates: { ...old.dates, plannedOpen: '2026-12-15', opened: null, firstDD: null, bonusPaidOut: null, closed: null, reopenAfter: null } })
  await bootLate(page, { 'bb_local_db/accounts.json': JSON.stringify(accounts) })
  await expect(page.locator('#section-today')).not.toContainText('Eligible to Reopen')
})

test('Today: a reminder dated before today stays until marked done', async ({ page }) => {
  const { errors } = await bootLate(page, { 'bb_local_db/accounts.json': accountsWithReminder() })
  const today = page.locator('#section-today')
  const reminders = today.locator('.card', { hasText: 'Reminders' })
  await expect(reminders).toContainText('Move the DD back')
  await expect(reminders.locator('.late')).toHaveText('5 days overdue')
  // Overdue open + reopen + reminder.
  await expect.poll(() => page.evaluate(() => window.__badge)).toBe(3)

  await reminders.getByRole('button', { name: 'Done' }).click()
  await expect(reminders.getByRole('button', { name: 'Done ✓' })).toBeDisabled()
  await expect.poll(() => page.evaluate(() => window.__badge)).toBe(2)
  await page.reload()
  await expect(page.locator('#section-today')).not.toContainText('Move the DD back')
  expect(errors).toEqual([])
})

test('Today: a dismissal covers only the reopen date it was made against', async ({ page }) => {
  const accounts = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const acc = accounts.find((x) => x.id === 'a_closed_1')
  // Dismissed back in May against an older date; the date has since moved to Nov 1.
  acc.reopenDismissedOn = '2026-05-10'
  await bootLate(page, { 'bb_local_db/accounts.json': JSON.stringify(accounts) })
  await expect(page.locator('#section-today')).toContainText('Eligible to Reopen')
})

test('Today: an older account at the same bank does not hide a reopen', async ({ page }) => {
  const accounts = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
  const acc = accounts.find((x) => x.id === 'a_closed_1')
  acc.dates.opened = null // entered by hand without an opened date
  accounts.push({ ...acc, id: 'a_older', dates: { ...acc.dates, opened: '2023-02-01', closed: '2023-09-01', reopenAfter: '2024-09-01' },
    reopenDismissedOn: '2024-09-02' })
  // A record with no dates at all must not break Today either.
  accounts.push({ id: 'a_nodates', institution: 'Closed Cooperative', person: 'Sam', status: 'closed' })
  const { errors } = await bootLate(page, { 'bb_local_db/accounts.json': JSON.stringify(accounts) })
  const reopen = page.locator('#section-today .card', { hasText: 'Eligible to Reopen' })
  await expect(reopen).toContainText('Closed Cooperative')
  expect(errors).toEqual([])
})
