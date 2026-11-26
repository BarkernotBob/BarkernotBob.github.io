const { test, expect } = require('@playwright/test')
const fs = require('fs')
const path = require('path')
const { bootApp, goTab } = require('./support/boot')

// State picker (wish-list #6): offers limited to other states drop to the
// bottom of Offers and stay out of the opening plan.

const FIX = path.join(__dirname, 'fixtures', 'db')
const read = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'))

async function boot(page, seed) {
  await page.clock.setFixedTime(new Date('2026-11-26T17:00:00Z'))
  return bootApp(page, seed ? { seed } : {})
}

test('your state is saved from Settings', async ({ page }) => {
  await boot(page)
  await goTab(page, 'settings')
  await page.locator('#set_state').selectOption('IN')
  await expect(page.locator('.toast').last()).toContainText('State set to IN')
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('bb_local_db/config.json')))
  expect(cfg.state).toBe('IN')
})

test('an offer only for another state goes last and out of the plan', async ({ page }) => {
  const config = read('config.json')
  config.state = 'IN'
  const offers = read('offers.json')
  offers.find((o) => o.id === 'seed_test_02').states = ['OH']
  const { errors } = await boot(page, {
    'bb_local_db/config.json': JSON.stringify(config),
    'bb_local_db/offers.json': JSON.stringify(offers),
  })
  await goTab(page, 'offers')
  const cards = page.locator('#section-offers .card')
  await expect(cards.nth(0)).toContainText('Fixture Federal Credit Union')
  const tb = page.locator('#section-offers .card', { hasText: 'Testbank & Trust' })
  await expect(tb.locator('.rank-group')).toHaveText('⌂ Not in your state')
  await expect(tb).toContainText('OH only')
  await expect(page.locator('#section-offers .plan-card')).not.toContainText('Testbank')
  expect(errors).toEqual([])
})

test('an offer in your state, or with no states on file, ranks as usual', async ({ page }) => {
  const config = read('config.json')
  config.state = 'OH'
  const offers = read('offers.json')
  offers.find((o) => o.id === 'seed_test_02').states = ['OH', 'IN']
  await boot(page, {
    'bb_local_db/config.json': JSON.stringify(config),
    'bb_local_db/offers.json': JSON.stringify(offers),
  })
  await goTab(page, 'offers')
  const cards = page.locator('#section-offers .card')
  await expect(cards.nth(0)).toContainText('Testbank & Trust')
  await expect(cards.nth(0)).toContainText('OH, IN only')
  await expect(cards.nth(1)).toContainText('Fixture Federal Credit Union')
  await expect(cards.nth(1).locator('.rank-line')).toHaveText(/#2/)
})

test('the states an offer is open in are set when editing it', async ({ page }) => {
  await boot(page)
  await goTab(page, 'offers')
  await page.locator('#section-offers .card', { hasText: 'Fixture Federal Credit Union' }).getByRole('button', { name: 'Edit' }).click()
  const dlg = page.locator('.modal-card')
  await dlg.locator('#eo_states').fill('in, oh, xx, IN')
  await dlg.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.toast').last()).toContainText('Fixture Federal Credit Union saved')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('bb_local_db/offers.json')).find((o) => o.id === 'seed_test_01'))
  expect(saved.states).toEqual(['IN', 'OH'])
})
