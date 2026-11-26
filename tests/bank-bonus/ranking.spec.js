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
  // Testbank now takes 180 minutes ($134/hr), so Fixture FCU moves ahead.
  const cards = page.locator('#section-offers .card')
  await expect(cards.nth(0)).toContainText('Fixture Federal Credit Union')
  await expect(cards.nth(1).locator('.rank-line')).toHaveText(/#2\s+\$134\/hr/)
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
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'offers-ranked.png'), fullPage: true })
  await goTab(page, 'settings')
  await page.locator('#section-settings .card', { hasText: 'Offer ranking' }).screenshot({ path: path.join(__dirname, 'screenshots', 'ranking-settings.png') })
})
