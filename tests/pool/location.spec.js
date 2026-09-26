// Issue #165 — Settings → set the pool's location by address OR by lat/lon,
// with a link to look lat/lon up.
//
// Before this, "By address" used Open-Meteo's place-name search, which cannot
// find a street address; typing an address and tapping Save without first
// tapping "Look up" silently kept the old coordinates; the iPhone decimal
// keypad has no minus sign, so a US longitude could not be typed; and
// switching modes re-rendered the card, moving Save and throwing away edits.
const { test, expect } = require('@playwright/test')
const { bootApp, goTab, VIEWPORTS } = require('./support/boot')

const configOf = (mock) => JSON.parse(mock.readFile('db/config.json'))

// Record every geocoder call and answer it. Registered after bootApp(), so it
// wins over the default stubs (Playwright matches newest-first).
async function geocoders(page, { nominatim = 'hit', openMeteo = 'hit' } = {}) {
  const calls = []
  await page.route('**://nominatim.openstreetmap.org/**', (route, req) => {
    calls.push(['nominatim', new URL(req.url()).searchParams.get('q')])
    if (nominatim === 'down') return route.fulfill({ status: 503, body: 'down' })
    const body = nominatim === 'none' ? [] : [{ lat: '41.0801', lon: '-85.1402', display_name: '1234, Main Street, Fort Wayne, Allen County, Indiana, 46802, United States' }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.route('**://geocoding-api.open-meteo.com/**', (route, req) => {
    calls.push(['open-meteo', new URL(req.url()).searchParams.get('name')])
    if (openMeteo === 'down') return route.fulfill({ status: 503, body: 'down' })
    const results = openMeteo === 'none' ? [] : [{ latitude: 41.0793, longitude: -85.1394, name: 'Fort Wayne', admin1: 'Indiana', country_code: 'US' }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results }) })
  })
  return calls
}

async function box(page, sel) {
  const b = await page.locator(sel).boundingBox()
  return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }
}

test('a street address is found (Nominatim) and saved with its coordinates', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  const calls = await geocoders(page)
  await goTab(page, 'settings')
  await page.getByRole('button', { name: 'By address' }).click()
  await page.fill('#s_addr', '1234 Main St, Fort Wayne, IN')
  await page.getByRole('button', { name: /Look up coordinates/ }).click()
  await expect(page.locator('#geoStatus')).toContainText('Found')
  await expect(page.locator('#geoStatus')).toContainText('41.0801, -85.1402')
  expect(calls).toEqual([['nominatim', '1234 Main St, Fort Wayne, IN']])

  await page.getByRole('button', { name: 'Save pool' }).click()
  await expect.poll(() => configOf(mock).geo.lat).toBe(41.0801)
  expect(configOf(mock).geo).toMatchObject({ lat: 41.0801, lon: -85.1402, mode: 'address', address: '1234 Main St, Fort Wayne, IN' })
  // Save reused the lookup rather than asking again.
  expect(calls.length).toBe(1)
  expect(errors, errors.join('\n')).toEqual([])
})

test('Save looks the address up itself when Look up was never tapped', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await geocoders(page)
  await goTab(page, 'settings')
  await page.getByRole('button', { name: 'By address' }).click()
  await page.fill('#s_addr', '1234 Main St, Fort Wayne, IN')
  await page.getByRole('button', { name: 'Save pool' }).click()
  await expect.poll(() => configOf(mock).geo.lat).toBe(41.0801)
  expect(configOf(mock).geo.lon).toBe(-85.1402)
  expect(errors, errors.join('\n')).toEqual([])
})

test('Open-Meteo is the fallback when Nominatim is down or finds nothing', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  const calls = await geocoders(page, { nominatim: 'down' })
  await goTab(page, 'settings')
  await page.getByRole('button', { name: 'By address' }).click()
  await page.fill('#s_addr', 'Fort Wayne, IN')
  await page.getByRole('button', { name: 'Save pool' }).click()
  await expect.poll(() => configOf(mock).geo.lat).toBe(41.0793)
  expect(calls.map((c) => c[0])).toEqual(['nominatim', 'open-meteo'])
  // Down is a failed resource load in the console; that's the network, not the app.
  expect(errors.filter((e) => !/503/.test(e)), errors.join('\n')).toEqual([])
})

test('an address nobody can find is not saved and says so', async ({ page }) => {
  const { mock } = await bootApp(page)
  await geocoders(page, { nominatim: 'none', openMeteo: 'none' })
  await goTab(page, 'settings')
  const before = mock.readFile('db/config.json')
  await page.getByRole('button', { name: 'By address' }).click()
  await page.fill('#s_addr', 'zzqx nowhere')
  await page.getByRole('button', { name: 'Save pool' }).click()
  await expect(page.locator('#geoStatus')).toContainText('No match')
  await page.waitForTimeout(300)
  expect(mock.readFile('db/config.json')).toBe(before)
})

test('lat/lon mode saves typed coordinates, and ± adds the minus the iPhone keypad lacks', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'settings')
  await page.getByRole('button', { name: 'By lat/lon' }).click()
  await expect(page.locator('#s_lat')).toHaveAttribute('inputmode', 'decimal')
  await expect(page.locator('#s_lon')).toHaveAttribute('inputmode', 'decimal')
  await page.fill('#s_lat', '41.1306')
  await page.fill('#s_lon', '85.1289')
  await page.getByRole('button', { name: /Flip longitude/ }).click()
  await expect(page.locator('#s_lon')).toHaveValue('-85.1289')
  await page.getByRole('button', { name: 'Save pool' }).click()
  await expect.poll(() => configOf(mock).geo.lat).toBe(41.1306)
  expect(configOf(mock).geo).toMatchObject({ lat: 41.1306, lon: -85.1289, mode: 'latlon' })
  expect(errors, errors.join('\n')).toEqual([])
})

test('out-of-range or non-numeric coordinates are refused with a message', async ({ page }) => {
  const { mock } = await bootApp(page)
  await goTab(page, 'settings')
  const before = mock.readFile('db/config.json')
  await page.getByRole('button', { name: 'By lat/lon' }).click()
  await page.fill('#s_lat', '141')
  await page.fill('#s_lon', '-85')
  await page.getByRole('button', { name: 'Save pool' }).click()
  await expect(page.locator('#latStatus')).toContainText('between -90 and 90')
  await page.fill('#s_lat', 'abc')
  await page.getByRole('button', { name: 'Save pool' }).click()
  await expect(page.locator('#latStatus')).toContainText('as numbers')
  await page.waitForTimeout(300)
  expect(mock.readFile('db/config.json')).toBe(before)
  // Hemisphere letters, as some sites print them, are understood.
  await page.fill('#s_lat', '41.13 N')
  await page.fill('#s_lon', '85.13 W')
  await page.getByRole('button', { name: 'Save pool' }).click()
  await expect.poll(() => configOf(mock).geo.lon).toBe(-85.13)
})

test('lat/lon mode links to a lat/lon finder that opens in a new tab', async ({ page }) => {
  await bootApp(page)
  await goTab(page, 'settings')
  await page.getByRole('button', { name: 'By lat/lon' }).click()
  const link = page.locator('.geopanel[data-geo="latlon"] a[href="https://www.latlong.net/"]')
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
})

for (const vp of ['mobile', 'desktop']) {
  test(`switching modes moves nothing and keeps edits (${vp})`, async ({ page }) => {
    await bootApp(page, { viewport: VIEWPORTS[vp] })
    await geocoders(page)
    await goTab(page, 'settings')
    await page.fill('#s_name', 'Unsaved Name')
    const save = 'button[data-action="savePool"]'
    const tabs = '#geoTabs'
    const email = '#s_email'
    const start = [await box(page, save), await box(page, tabs), await box(page, email)]
    for (const mode of ['By address', 'By lat/lon', 'By address']) {
      await page.getByRole('button', { name: mode }).click()
      expect([await box(page, save), await box(page, tabs), await box(page, email)]).toEqual(start)
    }
    // A lookup result, however long, can't push Save down either.
    await page.fill('#s_addr', '1234 Main St, Fort Wayne, IN')
    await page.getByRole('button', { name: /Look up coordinates/ }).click()
    await expect(page.locator('#geoStatus')).toContainText('Found')
    expect(await box(page, save)).toEqual(start[0])
    // The lookup is mirrored into the lat/lon boxes, and the name typed above survived.
    await page.getByRole('button', { name: 'By lat/lon' }).click()
    await expect(page.locator('#s_lat')).toHaveValue('41.0801')
    await expect(page.locator('#s_name')).toHaveValue('Unsaved Name')
    // The hidden panel is not focusable or clickable.
    await expect(page.locator('.geopanel[data-geo="address"]')).toHaveAttribute('inert', '')
    // No sideways scroll.
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(over).toBeLessThanOrEqual(0)
    await page.locator('#geoTabs').scrollIntoViewIfNeeded()
    await page.locator('.geopanels').locator('..').screenshot({ path: `test-results/location-${vp}.png` })
  })
}
