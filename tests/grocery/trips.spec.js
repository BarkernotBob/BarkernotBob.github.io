const { test, expect } = require('@playwright/test')
const { bootApp } = require('./support/boot')

// S5 Trips (§12 S5): every receipt/order, all sources, reverse-chron, no cap.
// Rows carry provenance + channel + total; the detail is a receipt-motif SHEET
// (§9.5) that opens as an overlay (no list reflow). Structured orders get a
// Print/PDF button; only photo receipts get a photo viewer.

test('trips lists every receipt with provenance, channel and total', async ({ page }) => {
  const { errors } = await bootApp(page)
  await page.click('nav [data-tab="trips"]')
  // 3 fixture receipts: Publix (snap), the unprocessed one, Walmart (sync).
  await expect(page.locator('.triprow')).toHaveCount(3)
  await expect(page.locator('.triprow .prov.snap').first()).toBeVisible()
  await expect(page.locator('.triprow .prov.sync')).toBeVisible()
  // The Walmart order carries its delivery channel chip; the unread one reads "reading…".
  await expect(page.locator('.triprow', { hasText: 'Walmart' }).locator('.chchip')).toContainText('delivery')
  await expect(page.locator('.triprow .pill.gray')).toContainText('reading')
  expect(errors, errors.join(' | ')).toEqual([])
})

test('a structured order opens the receipt motif with fees, footer and Print', async ({ page }) => {
  const { errors } = await bootApp(page)
  await page.click('nav [data-tab="trips"]')
  const list = page.locator('.triplist')
  const before = await list.boundingBox()

  await page.locator('.triprow', { hasText: 'Walmart' }).click()
  const sheet = page.locator('.sheet-card')
  await expect(sheet).toBeVisible()
  // Receipt motif: perforated edge, dot-leader line items for both order lines.
  await expect(sheet.locator('.receipt-perf')).toBeVisible()
  await expect(sheet.locator('.rline')).toHaveCount(2)
  await expect(sheet.locator('.rline .lead').first()).toBeVisible()
  // Totals block includes the delivery Fees line and a grand Total.
  await expect(sheet.locator('.rtot', { hasText: 'Fees' })).toBeVisible()
  await expect(sheet.locator('.rtot.grand')).toContainText('$8.67')
  // Footer carries provenance + orderKey + storeNumber.
  await expect(sheet.locator('.rfoot')).toContainText('walmart:1234567890')
  await expect(sheet.locator('.rfoot')).toContainText('Store #1195')
  // Structured order → Print/PDF button; photo-less → no photo viewer.
  await expect(sheet.locator('[data-action="tripPrint"]')).toBeVisible()
  await expect(sheet.locator('[data-action="tripPhoto"]')).toHaveCount(0)

  // Opening the sheet did not move the list behind it.
  const after = await list.boundingBox()
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1)
  expect(errors, errors.join(' | ')).toEqual([])
})

test('a photo receipt opens the motif with a photo viewer and no Print', async ({ page }) => {
  const { errors } = await bootApp(page)
  await page.click('nav [data-tab="trips"]')
  await page.locator('.triprow', { hasText: 'Publix' }).click()
  const sheet = page.locator('.sheet-card')
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('[data-action="tripPhoto"]')).toBeVisible()
  await expect(sheet.locator('[data-action="tripPrint"]')).toHaveCount(0)
  // No live <img> from the XSS payload item that lives on this receipt.
  expect(await sheet.locator('img').count()).toBe(0)
  expect(errors, errors.join(' | ')).toEqual([])
})

test('Print/PDF triggers window.print on desktop', async ({ page }) => {
  await bootApp(page)
  await page.evaluate(() => {
    window.__printed = 0
    window.print = () => {
      window.__printed++
    }
  })
  await page.click('nav [data-tab="trips"]')
  await page.locator('.triprow', { hasText: 'Walmart' }).click()
  await page.locator('[data-action="tripPrint"]').click()
  expect(await page.evaluate(() => window.__printed)).toBe(1)
})
