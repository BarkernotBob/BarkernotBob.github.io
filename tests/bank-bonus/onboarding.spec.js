const { test, expect } = require('@playwright/test')
const path = require('path')
const { bootApp, goTab } = require('./support/boot')

// Getting started (wish-list #5, #3, #2): a new user with no accounts sees the
// setup steps on Today, the terms are explained in one dialog, and the tax
// rate can be set in Settings.

test('with no accounts, Today walks through getting started', async ({ page }, testInfo) => {
  const { errors } = await bootApp(page, { seed: { 'bb_local_db/accounts.json': '[]' } })
  const card = page.locator('#section-today .gs-card')
  await expect(card).toContainText('Get started')
  await expect(card.locator('.gs-title')).toHaveText(['Tell it about your paycheck', 'Add accounts you already have', 'Pick from the offers'])
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'get-started.png') })
  await testInfo.attach('get-started', { path: path.join(__dirname, 'screenshots', 'get-started.png'), contentType: 'image/png' })

  await card.getByRole('button', { name: 'How it works' }).click()
  const dlg = page.locator('.modal-card')
  await expect(dlg.locator('.how-term')).toHaveText(['Bonus', 'Direct deposit (DD)', 'Float', '$/hr', 'Opening plan', 'Fees', 'Reopen'])
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(__dirname, 'screenshots', 'how-it-works.png') })
  await dlg.getByRole('button', { name: 'Close' }).click()
  await expect(dlg).toHaveCount(0)

  await card.getByRole('button', { name: 'See offers' }).click()
  await expect(page.locator('#section-offers')).toBeVisible()
  await page.locator('#section-offers .rank-summary').getByRole('button', { name: 'How it works' }).click()
  await expect(page.locator('.modal-card')).toContainText('What an offer pays per hour of your time')
  await page.keyboard.press('Escape')

  await goTab(page, 'today')
  await page.locator('#section-today .gs-card').getByRole('button', { name: 'Open Settings' }).click()
  await expect(page.locator('#section-settings')).toBeVisible()
  expect(errors).toEqual([])
})

test('Today shows the usual view once an account exists', async ({ page }) => {
  await bootApp(page)
  await expect(page.locator('#section-today')).toBeVisible()
  await expect(page.locator('#section-today .gs-card')).toHaveCount(0)
})

test('the tax rate is set in Settings and changes the ranking', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-26T17:00:00Z'))
  await bootApp(page)
  await goTab(page, 'settings')
  const card = page.locator('#section-settings .card', { hasText: 'Offer ranking' })
  await expect(card.locator('#rk_tax')).toHaveValue('16.75')
  await card.locator('#rk_tax').fill('30')
  await card.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.toast').last()).toContainText('Ranking settings saved')
  const cfg = await page.evaluate(() => JSON.parse(localStorage.getItem('bb_local_db/config.json')))
  expect(cfg.taxRate).toBe(0.3)
  await goTab(page, 'offers')
  // Testbank: $500 × 0.7 = $350, less $13 after-tax lost interest, over 90 minutes = $224/hr.
  await expect(page.locator('#section-offers .card', { hasText: 'Testbank & Trust' }).locator('.rank-line')).toHaveText(/\$224\/hr/)
})
