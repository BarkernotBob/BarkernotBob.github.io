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
