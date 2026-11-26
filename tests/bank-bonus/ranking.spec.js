const { test, expect } = require('@playwright/test')
const fs = require('fs')
const path = require('path')
const { bootApp, goTab } = require('./support/boot')

// Offer ranking (design agreed Nov 2026): after-tax dollars per hour of time,
// less lost savings interest and fees; deposits stay until closing.
//
// Fixture terms, worked by hand with the defaults (30 open, 30 close, 15 a
// transfer, 30 balance upkeep, 4% savings, 30 days for a bonus to post):
// - Testbank & Trust: $500, $2,500 in 2 deposits, $1,500 for 60 days, 60-day window.
//   Open 90 days. Deposits cover the balance, so no transfer in. Lost interest
//   $16; 90 minutes; $267/hr.
// - Fixture FCU: $300, one $1,000 deposit, 90-day window, open 120 days.
//   Lost interest $10; 60 minutes; $240/hr. No fee on file.
// Float in use: Openbank One $1,000 and Paid Out Bank $1,200 have deposits in.

const FIX = path.join(__dirname, 'fixtures', 'db')

async function boot(page, seed) {
  await page.clock.setFixedTime(new Date('2026-11-26T17:00:00Z'))
  return bootApp(page, seed ? { seed } : {})
}

test('Offers are ranked by dollars per hour, with what each uses', async ({ page }) => {
  const { errors } = await boot(page)
  await goTab(page, 'offers')
  const section = page.locator('#section-offers')
  await expect(section.locator('.rank-summary')).toContainText('Float in use: $2,200 of $25,000')
  const cards = section.locator('.card')
  await expect(cards.nth(0)).toContainText('Testbank & Trust')
  await expect(cards.nth(0).locator('.rank-line')).toHaveText(/#1\s+\$267\/hr/)
  await expect(cards.nth(0).locator('.rank-uses')).toHaveText('Paycheck $2,500 · Float $2,500 ($16 lost interest) · 90 min')
  await expect(cards.nth(1)).toContainText('Fixture Federal Credit Union')
  await expect(cards.nth(1).locator('.rank-line')).toHaveText(/#2\s+\$240\/hr/)
  await expect(cards.nth(1).locator('.rank-how')).toHaveText('fee not on file')
  expect(errors).toEqual([])
})

test('changing the ranking settings re-orders the offers and is saved', async ({ page }) => {
  await boot(page)
  await goTab(page, 'settings')
  const card = page.locator('#section-settings .card', { hasText: 'Offer ranking' })
  await card.locator('#rk_upkeep').fill('120')
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.toast').last()).toContainText('Ranking settings saved')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bb_local_db/config.json')).ranking)
  expect(saved.minutes.upkeep).toBe(120)
  expect(saved.floatLimit).toBe(25000)
  await goTab(page, 'offers')
  // Testbank now takes 180 minutes ($133/hr), so Fixture FCU moves ahead.
  const cards = page.locator('#section-offers .card')
  await expect(cards.nth(0)).toContainText('Fixture Federal Credit Union')
  await expect(cards.nth(1).locator('.rank-line')).toHaveText(/#2\s+\$133\/hr/)
})

test('a fee is paid or avoided, whichever pays more per hour, and a full float is flagged', async ({ page }, testInfo) => {
  const offers = JSON.parse(fs.readFileSync(path.join(FIX, 'offers.json'), 'utf8'))
  const fcu = offers.find((o) => o.id === 'seed_test_01')
  // $15 a month, 1 grace month, avoidable by 10 purchases a month: open 120 days
  // is 4 months, 3 with the fee. Paying costs $45 ($195/hr); avoiding costs
  // 30 minutes of purchases ($160/hr), so paying wins.
  fcu.fee = { monthly: 15, graceMonths: 1, avoid: [{ type: 'purchases', count: 10 }], earlyCloseFee: null, earlyCloseDays: null, minutes: null }
  const tb = offers.find((o) => o.id === 'seed_test_02')
  tb.minBalance = 30000
  const config = JSON.parse(fs.readFileSync(path.join(FIX, 'config.json'), 'utf8'))
  await boot(page, { 'bb_local_db/offers.json': JSON.stringify(offers), 'bb_local_db/config.json': JSON.stringify(config) })
  await goTab(page, 'offers')
  const fcuCard = page.locator('#section-offers .card', { hasText: 'Fixture Federal Credit Union' })
  await expect(fcuCard.locator('.rank-how')).toHaveText('pay $45 in fees')
  await expect(fcuCard.locator('.rank-line')).toContainText('$195/hr')
  const tbCard = page.locator('#section-offers .card', { hasText: 'Testbank & Trust' })
  await expect(tbCard.locator('.rank-how')).toContainText('move in $27,500')
  await expect(tbCard.locator('.rank-warn')).toHaveText('Float full: needs $30,000, $22,800 free')
  await testInfo.attach('offers-ranked-mobile.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
})

test('editing an offer saves its terms and fee and re-ranks it', async ({ page }) => {
  const { errors } = await boot(page)
  await goTab(page, 'offers')
  const fcuCard = page.locator('#section-offers .card', { hasText: 'Fixture Federal Credit Union' })
  await fcuCard.getByRole('button', { name: 'Edit' }).click()
  const dlg = page.locator('.modal-card')
  await expect(dlg).toContainText('Edit Fixture Federal Credit Union')
  // $15 a month, 1 free month, avoidable by 10 purchases a month: paying wins at $195/hr.
  await dlg.locator('#eo_fee').fill('15')
  await dlg.locator('#eo_grace').fill('1')
  await dlg.locator('#eo_av_pur').fill('10')
  await dlg.locator('#eo_av_bal').fill('5000')
  await dlg.locator('#eo_av_balkind').selectOption('average')
  await dlg.locator('#eo_keepopen').fill('180')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.toast').last()).toContainText('Fixture Federal Credit Union saved')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bb_local_db/offers.json')).find((o) => o.id === 'seed_test_01'))
  expect(saved.keepOpenDays).toBe(180)
  expect(saved.fee).toEqual({ monthly: 15, graceMonths: 1, earlyCloseFee: null, earlyCloseDays: null, minutes: null,
    avoid: [{ type: 'balance', amount: 5000, kind: 'average' }, { type: 'purchases', count: 10 }] })
  // Open 180 days is 6 months, 5 with the fee: paying $75 beats 50 purchases or parking $5,000.
  const card = page.locator('#section-offers .card', { hasText: 'Fixture Federal Credit Union' })
  await expect(card.locator('.rank-how')).toHaveText('pay $75 in fees')

  // A blank fee means "not on file"; the form opens with what was saved.
  await card.getByRole('button', { name: 'Edit' }).click()
  await expect(dlg.locator('#eo_fee')).toHaveValue('15')
  await expect(dlg.locator('#eo_av_balkind')).toHaveValue('average')
  await dlg.locator('#eo_fee').fill('')
  await dlg.locator('#eo_av_bal').fill('')
  await dlg.locator('#eo_av_pur').fill('')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await expect(card.locator('.rank-how')).toHaveText('fee not on file')
  expect(errors).toEqual([])
})

test("offers nobody can reopen go last, and a business doesn't count for personal offers", async ({ page }) => {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'))
  const config = read('config.json')
  config.people = ['Me', 'Sam', 'Business']
  const offers = read('offers.json')
  const base = offers.find((o) => o.id === 'seed_test_01')
  offers.push({ ...base, id: 'o_gone', institution: 'Gone Bank', monthsTillReopen: null, churnable: false })
  offers.push({ ...base, id: 'o_half', institution: 'Half Bank', monthsTillReopen: null, churnable: false })
  const accounts = read('accounts.json')
  const closed = accounts.find((a) => a.id === 'a_closed_1')
  const past = (id, institution, person, status) => ({ ...closed, id, offerId: null, institution, person, status, monthsTillReopen: null,
    dates: { plannedOpen: null, opened: '2025-01-10', firstDD: null, bonusPaidOut: '2025-04-01', closed: status === 'closed' ? '2025-06-01' : null, reopenAfter: null } })
  accounts.push(past('a_gone_me', 'Gone Bank', 'Me', 'closed'), past('a_gone_sam', 'Gone Bank', 'Sam', 'closed'))
  accounts.push(past('a_half_me', 'Half Bank', 'Me', 'closed'), past('a_half_sam', 'Half Bank', 'Sam', 'open'))
  const { errors } = await boot(page, {
    'bb_local_db/config.json': JSON.stringify(config),
    'bb_local_db/offers.json': JSON.stringify(offers),
    'bb_local_db/accounts.json': JSON.stringify(accounts),
  })
  await goTab(page, 'offers')
  const cards = page.locator('#section-offers .card')
  await expect(cards).toHaveCount(4)
  await expect(cards.nth(2)).toContainText('Half Bank')
  await expect(cards.nth(2).locator('.rank-group')).toHaveText('● Already have one')
  await expect(cards.nth(3)).toContainText('Gone Bank')
  await expect(cards.nth(3).locator('.rank-group')).toHaveText('✕ Had one, no reopen date')
  await expect(cards.nth(3).locator('.elig')).toContainText('? Me: had one, check terms')
  // Neither is in the opening plan.
  await expect(page.locator('#section-offers .plan-card')).not.toContainText('Gone Bank')
  await page.locator('#section-offers .plan-card').getByRole('button', { name: 'See the plan' }).click()
  await expect(page.locator('.modal-card .plan-item')).toHaveCount(4)
  await expect(page.locator('.modal-card')).not.toContainText('Gone Bank')
  await expect(page.locator('.modal-card')).not.toContainText('Half Bank')
  expect(errors).toEqual([])
})
