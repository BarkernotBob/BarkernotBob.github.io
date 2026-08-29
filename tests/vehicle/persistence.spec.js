const { test, expect } = require('@playwright/test')
const { bootApp, goTab, stored, fixtureState } = require('./support/boot')

// Export and import are vehicle's whole backup story. It has no sync, so this
// file is the only way data leaves one device and reaches another — if it
// breaks, the app's answer to "I got a new phone" is "start again".

test('export writes the current state as JSON', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'settings')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportBtn').click(),
  ])

  expect(download.suggestedFilename()).toBe('driveline-vehicles.json')
  const stream = await download.createReadStream()
  const chunks = []
  for await (const c of stream) chunks.push(c)
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'))

  expect(exported.vehicles).toHaveLength(3)
  expect(exported.vehicles.map((v) => v.name)).toContain('Testa Voltage')
  expect(exported.settings.annualMiles).toBe(12000)
  expect(errors, errors.join('\n')).toEqual([])
})

test('an export can be imported back', async ({ page }) => {
  // The round trip that matters: what comes out has to go back in. A schema
  // drift between the two is invisible until someone actually needs the backup.
  const { errors } = await bootApp(page)
  await goTab(page, 'settings')

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#exportBtn').click(),
  ])
  const stream = await download.createReadStream()
  const chunks = []
  for await (const c of stream) chunks.push(c)
  const exported = Buffer.concat(chunks)

  // Wipe, then restore from the export.
  page.once('dialog', (d) => d.accept())
  await page.locator('#resetBtn').click()
  await expect.poll(async () => (await stored(page)).vehicles.length).toBeGreaterThan(3)

  await goTab(page, 'settings')
  await page.locator('#importFile').setInputFiles({
    name: 'driveline-vehicles.json',
    mimeType: 'application/json',
    buffer: exported,
  })

  await expect.poll(async () => (await stored(page)).vehicles.length).toBe(3)
  await goTab(page, 'garage')
  await expect(page.locator('#app')).toContainText('Testa Voltage')
  expect(errors, errors.join('\n')).toEqual([])
})

test('importing a file replaces the garage and reports the count', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'settings')

  const incoming = fixtureState()
  incoming.vehicles = incoming.vehicles.slice(0, 1)
  incoming.vehicles[0].name = 'Imported Only Car'

  await page.locator('#importFile').setInputFiles({
    name: 'driveline-vehicles.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(incoming)),
  })

  await expect(page.locator('#toast')).toContainText('Imported 1 vehicles')
  await expect.poll(async () => (await stored(page)).vehicles.length).toBe(1)
  await expect(page.locator('#app')).toContainText('Imported Only Car')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a junk file is rejected without destroying what you have', async ({ page }) => {
  // The failure mode that would really hurt: pick the wrong file, lose the lot.
  const { errors } = await bootApp(page)
  await goTab(page, 'settings')

  await page.locator('#importFile').setInputFiles({
    name: 'holiday-photo.json',
    mimeType: 'application/json',
    buffer: Buffer.from('this is not json at all'),
  })

  await expect(page.locator('#toast')).toContainText(/couldn.t read|not a Driveline|invalid/i)
  expect((await stored(page)).vehicles).toHaveLength(3)
  await goTab(page, 'garage')
  await expect(page.locator('#app')).toContainText('Testa Voltage')
  expect(errors, errors.join('\n')).toEqual([])
})

test('valid JSON that is not a Driveline export is rejected too', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'settings')

  await page.locator('#importFile').setInputFiles({
    name: 'something-else.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ hello: 'world' })),
  })

  await expect(page.locator('#toast')).toContainText(/couldn.t read|not a Driveline|invalid/i)
  expect((await stored(page)).vehicles).toHaveLength(3)
  expect(errors, errors.join('\n')).toEqual([])
})

test('an import missing settings still gets sane defaults', async ({ page }) => {
  // importData merges over Eng.DEFAULTS. Without that, an older or hand-made
  // export leaves settings undefined and every figure renders as NaN.
  const { errors } = await bootApp(page)
  await goTab(page, 'settings')

  const incoming = fixtureState()
  delete incoming.settings

  await page.locator('#importFile').setInputFiles({
    name: 'old-export.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(incoming)),
  })

  await expect.poll(async () => (await stored(page)).settings.annualMiles).toBe(10000)
  await goTab(page, 'garage')
  await expect(page.locator('#app')).not.toContainText('NaN')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a half-typed year does not throw the vehicle screen away', async ({ page }) => {
  // The Year box keeps whatever you type while it is not yet a number, so that
  // clearing it to retype does not destroy the row. One of those reaching the
  // model made refYear NaN → maxAge NaN → optimal() null, and the detail view
  // died on `opt.buyAge`. Typing, not importing: no file needed.
  const { errors } = await bootApp(page)

  await page.locator('.vcard').first().click()
  await page.locator('[data-vt="data"]').click()
  const year = page.locator('.dt-row').first().locator('input[data-c="0"]')
  await year.fill('20x5')
  await year.blur()

  await page.locator('[data-vt="overview"]').click()
  await expect(page.locator('#app .view')).toBeVisible()
  await expect(page.locator('#app')).not.toContainText('NaN')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a cleared year row is ignored, not treated as year zero', async ({ page }) => {
  // Blank and null both coerce to 0, so a naive isFinite() check invents a year
  // zero: refYear stays 2025 while maxAge jumps to 2025, which gives a nonsense
  // model-year dropdown and ~40,000 ownership() passes on every single render.
  const { errors } = await bootApp(page, {
    mutate: (s) => {
      s.vehicles[0].rows[3][0] = null
      s.vehicles[0].rows[4][0] = ''
    },
  })

  await page.locator('.vcard').first().click()
  await expect(page.locator('#app .view')).toBeVisible()

  // The dropdown should still only offer the years actually in the data.
  const years = await page.locator('#pyMY option').allTextContents()
  expect(years.length).toBeLessThan(15)
  for (const y of years) expect(Number(y)).toBeGreaterThan(2000)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a vehicle whose rows are all unusable still opens', async ({ page }) => {
  // The degenerate end of the same case — every year unreadable, which an
  // imported file can produce wholesale. It should render something empty and
  // harmless, never throw. This is the case that reaches prep()'s no-usable-
  // rows fallback, so keep every year here genuinely unreadable.
  const { errors } = await bootApp(page, {
    mutate: (s) => {
      s.vehicles[0].rows = [
        ['', 0, 0, 0, 0],
        ['not a year', 0, 0, 0, 0],
      ]
    },
  })

  await page.locator('.vcard').first().click()
  await expect(page.locator('#app .view')).toBeVisible()
  await expect(page.locator('#abTitle')).toHaveText('Testa Voltage')

  // Rendering is not enough. Eng.prep() and ensurePurchase() have to agree on
  // what counts as a year, or the purchase point resolves against a different
  // reference year than the model does: the screen came up reading "A 0 at
  // 30,000 mi" and "Typical for a 0: ~27,337,500 mi", with a model-year
  // dropdown the user could not correct because ensurePurchase() re-clamps on
  // every render.
  await expect(page.locator('#app')).not.toContainText('A 0 ')
  await expect(page.locator('#app')).not.toContainText('Typical for a 0')
  const years = await page.locator('#pyMY option').allTextContents()
  for (const y of years) expect(Number(y)).toBeGreaterThan(2000)
  const saved = await stored(page)
  expect(saved.vehicles[0].purchase.modelYear).toBeGreaterThan(2000)

  await page.locator('[data-vt="data"]').click()
  await expect(page.locator('#app .view')).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

test('an out-of-range assumption is clamped when typed, not silently on reload', async ({
  page,
}) => {
  // The bounds only used to exist on the load path. Typing 150 into Inflation
  // stored 1.5 and displayed "150.0%", and the next launch quietly rewrote it
  // to 100.0% — a number the user never chose appearing out of nowhere, with
  // every projection built on it in between.
  const { errors } = await bootApp(page)

  page.once('dialog', (d) => d.accept('150'))
  await page.locator('[data-assume="inflation"]').click()

  await expect.poll(async () => (await stored(page)).settings.inflation).toBe(1)
  await expect(page.locator('[data-assume="inflation"]')).toContainText('100.0%')

  // And the reload changes nothing — the value on screen is the value stored.
  await page.reload()
  await expect(page.locator('[data-assume="inflation"]')).toContainText('100.0%')
  expect((await stored(page)).settings.inflation).toBe(1)
  expect(errors, errors.join('\n')).toEqual([])
})

test('no rendered figure is ever NaN', async ({ page }) => {
  // A single NaN leaking into the model shows up as "$NaN" across the screen
  // and is the most likely visible symptom of a maths regression.
  const { errors } = await bootApp(page)

  for (const tab of ['garage', 'compare', 'settings']) {
    await goTab(page, tab)
    await expect(page.locator('#app')).not.toContainText('NaN')
  }
  await goTab(page, 'garage')
  await page.locator('.vcard').first().click()
  await expect(page.locator('#app')).not.toContainText('NaN')
  await page.locator('[data-vt="data"]').click()
  await expect(page.locator('#app')).not.toContainText('NaN')
  expect(errors, errors.join('\n')).toEqual([])
})
