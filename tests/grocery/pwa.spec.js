const { test, expect } = require('@playwright/test')
const { bootApp } = require('./support/boot')

// Slice S2 (PRD §FR-18 / §13 class 3): installable PWA + input compliance on the
// existing UI. These are mechanical, so a regression (dropped manifest, a <16px
// input, a re-added maximum-scale) fails CI.

test('manifest is linked, valid, and its icons resolve', async ({ page }) => {
  await bootApp(page)
  const href = await page.getAttribute('link[rel="manifest"]', 'href')
  expect(href).toBe('manifest.webmanifest')

  const man = await page.evaluate(async () => {
    const r = await fetch('manifest.webmanifest')
    return r.ok ? r.json() : null
  })
  expect(man).toBeTruthy()
  expect(man.name).toContain('Grocery')
  expect(man.display).toBe('standalone')
  expect(man.start_url).toBeTruthy()
  const sizes = man.icons.map((i) => i.sizes)
  expect(sizes).toContain('192x192')
  expect(sizes).toContain('512x512')
  expect(man.icons.some((i) => (i.purpose || '').includes('maskable'))).toBe(true)

  // Every icon file (+ apple-touch) actually exists.
  const paths = [...man.icons.map((i) => i.src), 'icons/apple-touch-icon.png']
  const statuses = await page.evaluate(async (ps) => {
    const out = {}
    for (const p of ps) out[p] = (await fetch(p)).status
    return out
  }, paths)
  for (const p of paths) expect(statuses[p], p).toBe(200)
})

test('apple-touch-icon + web-app-capable meta are present', async ({ page }) => {
  await bootApp(page)
  expect(await page.getAttribute('link[rel="apple-touch-icon"]', 'href')).toBe('icons/apple-touch-icon.png')
  expect(await page.getAttribute('meta[name="apple-mobile-web-app-capable"]', 'content')).toBe('yes')
  expect(await page.getAttribute('meta[name="mobile-web-app-capable"]', 'content')).toBe('yes')
  expect(await page.getAttribute('meta[name="theme-color"]', 'content')).toBe('#2f7d4f')
})

test('viewport allows zoom (no maximum-scale / user-scalable) but kills double-tap', async ({ page }) => {
  await bootApp(page)
  const vp = await page.getAttribute('meta[name="viewport"]', 'content')
  expect(vp).toContain('viewport-fit=cover')
  expect(vp).not.toMatch(/maximum-scale/i)
  expect(vp).not.toMatch(/user-scalable/i)
  const ta = await page.evaluate(() => getComputedStyle(document.body).touchAction)
  expect(ta).toBe('manipulation')
})

test('service worker registers and activates', async ({ page }) => {
  await bootApp(page)
  const active = await page.evaluate(() =>
    Promise.race([
      navigator.serviceWorker.ready.then((r) => !!(r && r.active)),
      new Promise((res) => setTimeout(() => res(false), 8000)),
    ])
  )
  expect(active).toBe(true)
})

test('field-aware inputs: numeric keypad, email, date picker', async ({ page }) => {
  await bootApp(page)
  // Review: fixture na_0001 has field "price" → decimal keypad.
  await page.click('nav [data-tab="review"]')
  await expect(page.locator('#fix_na_0001')).toBeVisible()
  expect(await page.getAttribute('#fix_na_0001', 'inputmode')).toBe('decimal')
  // Settings: member email inputs → email keyboard.
  await page.click('nav [data-tab="settings"]')
  expect(await page.getAttribute('#mem_0', 'type')).toBe('email')
  expect(await page.getAttribute('#mem_0', 'inputmode')).toBe('email')
  // Reports: native date picker (pop-up calendar).
  await page.click('nav [data-tab="reports"]')
  expect(await page.getAttribute('#rf', 'type')).toBe('date')
})

test('no input is smaller than 16px anywhere (prevents iOS zoom-on-focus)', async ({ page }) => {
  await bootApp(page)
  for (const tab of ['capture', 'search', 'reports', 'review', 'table', 'settings']) {
    await page.click(`nav [data-tab="${tab}"]`)
    await page.waitForTimeout(40)
    const tooSmall = await page.$$eval('input, select, textarea', (els) =>
      els
        .filter((e) => e.offsetParent !== null) // visible only
        .map((e) => ({ id: e.id || e.getAttribute('data-f') || e.type, fs: parseFloat(getComputedStyle(e).fontSize) }))
        .filter((x) => x.fs < 16)
    )
    expect(tooSmall, `${tab}: ${JSON.stringify(tooSmall)}`).toEqual([])
  }
})
