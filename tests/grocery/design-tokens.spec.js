const { test, expect } = require('@playwright/test')
const { bootApp } = require('./support/boot')

// §13 assertion class 4 — the anti-generic backstop. These fail if the app ever
// regresses to a system-font / white-card generic look. Sentinels:
//   - body font-family contains Archivo (committed UI face, not a system stack)
//   - page ground computed bg == --paper, in BOTH themes (toggle data-theme)
//   - a hero stat renders in Fraunces (display face)
//   - a row money/figure renders in IBM Plex Mono (tabular figures)
//   - no .card uses raw #fff / rgb(255,255,255) as its background

function rgb(hex) {
  const h = hex.replace('#', '')
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`
}
const PAPER = { light: '#F7F2E9', dark: '#1C1A16' }

async function setTheme(page, theme) {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
}

test('body uses the committed Archivo UI face, not a system stack', async ({ page }) => {
  await bootApp(page)
  const ff = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  expect(ff).toContain('Archivo')
})

for (const theme of ['light', 'dark']) {
  test(`page ground equals --paper in ${theme} theme`, async ({ page }) => {
    await bootApp(page)
    await setTheme(page, theme)
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg).toBe(rgb(PAPER[theme]))
  })
}

test('hero stat renders in Fraunces (display face)', async ({ page }) => {
  await bootApp(page)
  await page.click('nav [data-tab="reports"]')
  const hero = page.locator('.hero-figure').first()
  await expect(hero).toBeVisible()
  const ff = await hero.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(ff).toContain('Fraunces')
})

test('row figures render in IBM Plex Mono (tabular figures)', async ({ page }) => {
  await bootApp(page)
  await page.click('nav [data-tab="table"]')
  const cell = page.locator('.tablewrap td').first()
  await expect(cell).toBeVisible()
  const ff = await cell.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(ff).toContain('Plex Mono')
})

for (const theme of ['light', 'dark']) {
  test(`no card is a raw white surface in ${theme} theme`, async ({ page }) => {
    await bootApp(page)
    await setTheme(page, theme)
    // Visit a few views so a range of cards is mounted.
    for (const tab of ['capture', 'reports', 'settings']) {
      await page.click(`nav [data-tab="${tab}"]`)
      await page.waitForTimeout(40)
      const whites = await page.$$eval('.card', (cards) =>
        cards
          .map((c) => getComputedStyle(c).backgroundColor)
          .filter((bg) => bg === 'rgb(255, 255, 255)' || bg === 'rgba(255, 255, 255, 1)')
      )
      expect(whites, `white card(s) found on ${tab}`).toEqual([])
    }
  })
}

// App chrome uses the "Grocer's Ledger" line-icon sprite, never emoji (§9: "Zero
// emoji as icons"). Guards the S3 nav/header icon slice against a regression to
// emoji glyphs and proves each nav tab + the wordmark resolve a <use href="#ic-*">.
test('nav + header render SVG icons, zero emoji as icons', async ({ page }) => {
  await bootApp(page)
  const tabs = ['capture', 'pantry', 'trips', 'reports', 'review', 'table', 'settings']
  for (const tab of tabs) {
    const use = page.locator(`nav [data-tab="${tab}"] .ic svg use`)
    await expect(use, `${tab} nav icon`).toHaveCount(1)
    expect(await use.getAttribute('href')).toMatch(/^#ic-/)
  }
  // Header wordmark + Settings both carry a sprite icon.
  await expect(page.locator('header h1 svg use')).toHaveCount(1)
  await expect(page.locator('.hd-settings svg use')).toHaveCount(1)
  // No emoji pictographs anywhere in the persistent chrome.
  const chrome = await page.$$eval('header, nav', (els) => els.map((e) => e.textContent).join(''))
  const emoji = chrome.match(/\p{Extended_Pictographic}/gu) || []
  expect(emoji, `emoji in chrome: ${emoji.join(' ')}`).toEqual([])
})
