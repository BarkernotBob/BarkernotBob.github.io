const { test, expect } = require('@playwright/test')
const fs = require('fs')
const path = require('path')
const { bootApp, goTab } = require('./support/boot')

// Opening plan (agreed Nov 26, 2026): ranked offers get the earliest date where
// their deposits fit the paydays and the parked cash stays under the float limit
// every day, at most 3 new accounts a pay period. Worked out for the fixtures
// (paydays $2,000 every 14 days, 21 days for a deposit to clear, float $25,000):
// - Testbank & Trust for Me and Sam and Fixture FCU for Me open Nov 26 (3 that period);
//   Fixture FCU for Sam waits for the next period, Dec 10.
// - Testbank for Me: $1,250 on Dec 18 and Jan 1. Sam gets what's left of those paydays.

const FIX = path.join(__dirname, 'fixtures', 'db')

async function boot(page, seed) {
  await page.clock.setFixedTime(new Date('2026-11-26T17:00:00Z'))
  return bootApp(page, seed ? { seed } : {})
}

test('the plan suggests dated openings; accept adds a planned account, skip hides one', async ({ page }) => {
  const { errors } = await boot(page)
  await goTab(page, 'offers')
  const card = page.locator('#section-offers .plan-card')
  await expect(card).toContainText('Open 4 accounts over the next 6 months for about $1,281 after tax, in about 5 hours. Float peaks at $7,000 on 01/29/27.')
  await expect(card).toContainText('Next: Testbank & Trust (Me), open by 11/26/26.')
  await card.getByRole('button', { name: 'See the plan' }).click()
  const dlg = page.locator('.modal-card')
  const items = dlg.locator('.plan-item')
  await expect(items).toHaveCount(4)
  await expect(items.nth(0)).toContainText('11/26/26 · Testbank & Trust (Me)')
  await expect(items.nth(0)).toContainText('Paycheck deposits: 12/18/26 $1,250, 01/01/27 $1,250')
  await expect(items.nth(3)).toContainText('12/10/26 · Fixture Federal Credit Union (Sam)')

  await items.nth(0).getByRole('button', { name: 'Accept' }).click()
  await expect(page.locator('.toast').last()).toContainText('Testbank & Trust added to Planned for 11/26/26')
  const accts = await page.evaluate(() => JSON.parse(localStorage.getItem('bb_local_db/accounts.json')))
  const added = accts.find((a) => a.institution === 'Testbank & Trust' && a.person === 'Me')
  expect(added.status).toBe('planned')
  expect(added.dates.plannedOpen).toBe('2026-11-26')
  expect(added.ddPlan).toEqual([
    { payrollDate: '2026-12-18', amount: 1250, auto: true },
    { payrollDate: '2027-01-01', amount: 1250, auto: true },
  ])
  // The dialog comes back without the accepted one.
  await expect(items).toHaveCount(3)
  await items.nth(0).getByRole('button', { name: 'Skip' }).click()
  await expect(items).toHaveCount(2)
  const plan = await page.evaluate(() => JSON.parse(localStorage.getItem('bb_local_db/config.json')).plan)
  expect(plan.skipped).toEqual(['seed_test_02|Sam'])
  await dlg.getByRole('button', { name: 'Bring back 1 skipped' }).click()
  await expect(items).toHaveCount(3)
  expect(errors).toEqual([])
})

test('the plan waits until the float has room', async ({ page }, testInfo) => {
  const config = JSON.parse(fs.readFileSync(path.join(FIX, 'config.json'), 'utf8'))
  config.ranking = { floatLimit: 3500 }
  await boot(page, { 'bb_local_db/config.json': JSON.stringify(config) })
  await goTab(page, 'offers')
  // $2,200 is parked now; Testbank needs $2,500 until the open accounts close.
  await expect(page.locator('#section-offers .plan-card')).toContainText('Next: Testbank & Trust (Me), open by 12/24/26.')
  await page.locator('#section-offers .plan-card').getByRole('button', { name: 'See the plan' }).click()
  await testInfo.attach('plan-mobile.png', { body: await page.screenshot(), contentType: 'image/png' })
})

test('plan settings are saved with the ranking settings', async ({ page }) => {
  await boot(page)
  await goTab(page, 'settings')
  const card = page.locator('#section-settings .card', { hasText: 'Offer ranking' })
  await card.locator('#pl_months').fill('3')
  await card.locator('#pl_per').fill('1')
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.toast').last()).toContainText('Ranking settings saved')
  const plan = await page.evaluate(() => JSON.parse(localStorage.getItem('bb_local_db/config.json')).plan)
  expect(plan.perPeriod).toBe(1)
  expect(plan.horizonDays).toBe(91)
})
