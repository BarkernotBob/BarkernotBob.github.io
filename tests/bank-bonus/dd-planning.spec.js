const { test, expect } = require('@playwright/test')
const fs = require('fs')
const path = require('path')
const { bootApp, goTab } = require('./support/boot')

// Issue #16: direct deposit planning never overbooks a payday.
// Fixture paycheck: $2,000 every 14 days from 2026-01-02 (… Nov 20, Dec 4,
// Dec 18, Jan 1, Jan 15 …), new DD clears in 21 days. Today is 2026-11-25.

const FIX = path.join(__dirname, 'fixtures', 'db')
const base = JSON.parse(fs.readFileSync(path.join(FIX, 'accounts.json'), 'utf8')).find((x) => x.id === 'a_planned_1')
const acct = (id, institution, over = {}) => ({
  ...base, id, institution, offerId: null, nbDeposits: null, directDepositTotal: 1000, daysToCompleteReq: 90,
  ddPlan: [], reminders: [], ...over,
  dates: { plannedOpen: '2026-11-25', opened: null, firstDD: null, bonusPaidOut: null, closed: null, reopenAfter: null, ...(over.dates || {}) },
})
const store = (page, file) => page.evaluate((f) => JSON.parse(localStorage.getItem('bb_local_db/' + f) || 'null'), file)
const plan = async (page, id) => ((await store(page, 'accounts.json')).find((x) => x.id === id).ddPlan || [])
  .map((d) => [d.payrollDate, d.amount, !!d.auto])

async function bootAt(page, accounts) {
  await page.clock.setFixedTime(new Date('2026-11-25T17:00:00Z'))
  return bootApp(page, { seed: { 'bb_local_db/accounts.json': JSON.stringify(accounts) } })
}
async function suggest(page, institution) {
  const tab = (await store(page, 'accounts.json')).find((x) => x.institution === institution).status
  await goTab(page, tab === 'open' ? 'active' : 'planned')
  await page.locator(`#section-${tab === 'open' ? 'active' : 'planned'} .card`, { hasText: institution }).locator('.card-title').click()
  await page.getByRole('button', { name: '⚡ Auto-suggest' }).click()
}
const totalsByDay = (accounts) => {
  const t = {}
  accounts.forEach((a) => (a.ddPlan || []).forEach((d) => { t[d.payrollDate] = (t[d.payrollDate] || 0) + d.amount }))
  return t
}

test('the earliest deadline gets first claim, and no payday is overbooked', async ({ page }) => {
  const { errors } = await bootAt(page, [
    acct('a_long', 'Long Window Bank', { directDepositTotal: 3000 }), // ends 2027-02-23
    acct('a_short', 'Short Window Bank', { directDepositTotal: 2500, daysToCompleteReq: 40, dates: { plannedOpen: '2026-11-20' } }), // ends 2026-12-30
  ])
  await suggest(page, 'Long Window Bank')
  await expect.poll(() => plan(page, 'a_long')).toEqual([['2026-12-18', 2000, true], ['2027-01-01', 1000, true]])

  await suggest(page, 'Short Window Bank')
  // Short Window ends first, so it takes Dec 18 and Long Window moves later.
  await expect.poll(() => plan(page, 'a_short')).toEqual([['2026-12-18', 2000, true]])
  expect(await plan(page, 'a_long')).toEqual([['2027-01-01', 2000, true], ['2027-01-15', 1000, true]])
  await expect(page.locator('.toast').last()).toContainText('Short $500')
  await expect(page.locator('.toast').last()).toContainText('also moved Long Window Bank')
  const totals = totalsByDay(await store(page, 'accounts.json'))
  Object.values(totals).forEach((v) => expect(v).toBeLessThanOrEqual(2000))
  expect(errors).toEqual([])
})

test('a bank that needs several deposits gets the total split evenly', async ({ page }) => {
  await bootAt(page, [acct('a_split', 'Split Savings', { nbDeposits: 4, daysToCompleteReq: 120 })])
  await suggest(page, 'Split Savings')
  await expect.poll(() => plan(page, 'a_split')).toEqual([
    ['2026-12-18', 250, true], ['2027-01-01', 250, true], ['2027-01-15', 250, true], ['2027-01-29', 250, true],
  ])
})

test('an uneven split gives the last deposit the rounding, not an extra deposit', async ({ page }) => {
  await bootAt(page, [acct('a_odd', 'Odd Split Bank', { directDepositTotal: 100, nbDeposits: 3 })])
  await suggest(page, 'Odd Split Bank')
  await expect.poll(() => plan(page, 'a_odd')).toEqual([
    ['2026-12-18', 33.33, true], ['2027-01-01', 33.33, true], ['2027-01-15', 33.34, true],
  ])
})

test('deposits set by hand stay put and use up their payday', async ({ page }) => {
  await bootAt(page, [
    acct('a_hand', 'Hand Set Bank', { directDepositTotal: 1800, ddPlan: [{ payrollDate: '2026-12-18', amount: 1800 }] }),
    acct('a_new', 'New Bank'),
  ])
  await suggest(page, 'New Bank')
  await expect.poll(() => plan(page, 'a_new')).toEqual([['2026-12-18', 200, true], ['2027-01-01', 800, true]])
  expect(await plan(page, 'a_hand')).toEqual([['2026-12-18', 1800, false]])
  await expect(page.locator('#section-detail')).toContainText('$200.00 on')
  await page.locator('#section-detail .card', { hasText: 'Direct Deposit Plan' }).screenshot({ path: path.join(__dirname, 'screenshots', 'dd-detail.png') })
})

test('suggestions never land on a payday that has passed', async ({ page }) => {
  // Opened Oct 1: its first payday after the 21-day clear (Oct 23) is past.
  await bootAt(page, [acct('a_late', 'Late Start Bank', { status: 'open', daysToCompleteReq: 120, dates: { plannedOpen: null, opened: '2026-10-01' } })])
  await suggest(page, 'Late Start Bank')
  await expect.poll(() => plan(page, 'a_late')).toEqual([['2026-12-04', 1000, true]])
})

test('one payday can be marked as a bigger paycheck, and planning uses it', async ({ page }, testInfo) => {
  const { errors } = await bootAt(page, [acct('a_big', 'Big Check Bank', { directDepositTotal: 3500 })])
  await goTab(page, 'calendar')
  await page.getByRole('button', { name: 'Next month' }).click()
  await page.locator('[data-action="calDay"][data-a1="2026-12-18"]').click()
  await expect(page.locator('.modal-ov')).toContainText('Paycheck: $2,000.00')
  await page.getByRole('button', { name: 'Change this paycheck' }).click()
  await page.locator('#pay_amt').fill('3500')
  await page.locator('.modal-ov').getByRole('button', { name: 'Save' }).click()
  await expect.poll(async () => (await store(page, 'config.json')).paycheck.bumps).toEqual({ '2026-12-18': 3500 })
  await expect(page.locator('[data-a1="2026-12-18"]')).toHaveClass(/cal-bump/)
  await page.locator('#section-calendar .card').screenshot({ path: path.join(__dirname, 'screenshots', 'calendar-bump.png') })
  await testInfo.attach('calendar-bump', { path: path.join(__dirname, 'screenshots', 'calendar-bump.png'), contentType: 'image/png' })

  await page.locator('[data-action="calDay"][data-a1="2026-12-18"]').click()
  await expect(page.locator('.modal-ov')).toContainText('(usually $2,000.00)')
  await page.locator('.modal-ov').getByRole('button', { name: 'Close' }).click()

  await suggest(page, 'Big Check Bank')
  await expect.poll(() => plan(page, 'a_big')).toEqual([['2026-12-18', 3500, true]])
  expect(errors).toEqual([])
})
