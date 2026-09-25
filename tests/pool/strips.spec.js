const { test, expect } = require('@playwright/test')
const { bootApp, goTab, fixture, VIEWPORTS } = require('./support/boot')

// Issue #137 — Strips mode logs the numbers printed on the strip bottle, not
// five words. Before this, every strip test was `levels` with `nums: {}`, so
// the trend lines, the combined-chlorine sum and the AI export all sat inert.
// Each case here guards one "Done when…" line of that issue.

async function committed(mock, file) {
  return JSON.parse(mock.readFile(`db/${file}`))
}
const pad = (page, key) => page.locator(`#testForm .scale[data-key="${key}"]`)
const values = (page, key, cls) =>
  pad(page, key).locator(`button.${cls}`).evaluateAll((els) => els.map((e) => Number(e.dataset.v)))

// The scales as the issue lists them off Isaiah's bottle.
const PRINTED = {
  fc: [0, 0.5, 1, 3, 5, 10],
  ph: [6.2, 6.8, 7.2, 7.8, 8.4],
  ta: [0, 40, 80, 120, 180, 240],
  cya: [0, 30, 100, 150, 300],
  ch: [0, 100, 250, 500],
}

test('each pad offers the values printed for it, plus the half-way values between swatches', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'test')
  for (const [key, scale] of Object.entries(PRINTED)) {
    expect(await values(page, key, 'v'), key).toEqual(scale)
  }
  // pH's target (7.4–7.6) sits between the printed 7.2 and 7.8 — the midpoint
  // is what lets a strip pH ever read as in range.
  expect(await values(page, 'ph', 'mid')).toEqual([6.5, 7, 7.5, 8.1])
  // No generic five-word picker survives anywhere on the form.
  await expect(page.locator('#testForm')).not.toContainText('normal')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a strip test saves into nums and gets the combined-chlorine sum', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'test')
  await pad(page, 'tc').locator('button.v[data-v="3"]').click()
  await pad(page, 'fc').locator('button.v[data-v="1"]').click()
  await pad(page, 'ph').locator('button.mid[data-v="7.5"]').click()
  await page.click('#t_save')

  await expect.poll(async () => (await committed(mock, 'tests.json')).length).toBe(3)
  const saved = (await committed(mock, 'tests.json')).at(-1)
  expect(saved.mode).toBe('strip')
  expect(saved.nums).toEqual({ tc: 3, fc: 1, ph: 7.5 })
  expect(saved.levels).toEqual({})

  const modal = page.locator('.modal-ov')
  // Only numbers can do this — words could only say "total reads higher".
  await expect(modal).toContainText('Combined chlorine is 2 ppm')
  await modal.locator('summary').click()
  await expect(modal.locator('.rec.ok').filter({ hasText: 'pH — 7.5' })).toHaveCount(1)
  expect(errors, errors.join('\n')).toEqual([])
})

test('tapping a lit value clears it, and a cleared pad is not saved', async ({ page }) => {
  const { mock } = await bootApp(page)
  await goTab(page, 'test')
  const one = pad(page, 'fc').locator('button.v[data-v="1"]')
  await one.click()
  await expect(one).toHaveClass(/\bon\b/)
  await expect(one).toHaveAttribute('aria-pressed', 'true')
  // Another value on the same pad moves the selection, never adds a second.
  await pad(page, 'fc').locator('button.v[data-v="3"]').click()
  await expect(pad(page, 'fc').locator('button.on')).toHaveCount(1)
  await pad(page, 'fc').locator('button.v[data-v="3"]').click()
  await expect(pad(page, 'fc').locator('button.on')).toHaveCount(0)
  await pad(page, 'ta').locator('button.v[data-v="80"]').click()
  await page.click('#t_save')
  await expect.poll(async () => (await committed(mock, 'tests.json')).length).toBe(3)
  expect((await committed(mock, 'tests.json')).at(-1).nums).toEqual({ ta: 80 })
})

test('a tap survives a Strips/Numbers switch, and what is lit is what is saved', async ({ page }) => {
  const { mock } = await bootApp(page)
  await goTab(page, 'test')
  await pad(page, 'cya').locator('button.v[data-v="30"]').click()
  await page.getByRole('button', { name: 'Numbers' }).click()
  await page.getByRole('button', { name: 'Strips' }).click()
  await expect(pad(page, 'cya').locator('button.v[data-v="30"]')).toHaveClass(/\bon\b/)
  await page.click('#t_save')
  await expect.poll(async () => (await committed(mock, 'tests.json')).length).toBe(3)
  expect((await committed(mock, 'tests.json')).at(-1).nums).toEqual({ cya: 30 })
})

for (const [name, viewport] of [['phone', VIEWPORTS.mobile], ['desktop', VIEWPORTS.desktop]]) {
  test(`tapping values moves nothing on the form (${name})`, async ({ page }) => {
    await bootApp(page, { viewport })
    await goTab(page, 'test')
    const boxes = () =>
      page.locator('#testForm button, #t_date, #t_save').evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect()
          return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(',')
        }),
      )
    const before = await boxes()
    await pad(page, 'fc').locator('button.v[data-v="10"]').click()
    await pad(page, 'ph').locator('button.mid[data-v="8.1"]').click()
    await pad(page, 'ch').locator('button.v[data-v="500"]').click()
    await pad(page, 'ch').locator('button.v[data-v="500"]').click()
    expect(await boxes()).toEqual(before)
    // And the widest pad still fits a phone without scrolling sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('history draws a trend line for free chlorine and pH once two strip tests exist', async ({ page }) => {
  const tests = [
    { id: 's1', date: '2026-07-10', at: '2026-07-10T12:00:00Z', by: 'x', mode: 'strip', levels: {}, nums: { fc: 3, ph: 7.5 }, notes: '' },
    { id: 's2', date: '2026-07-13', at: '2026-07-13T12:00:00Z', by: 'x', mode: 'strip', levels: {}, nums: { fc: 1, ph: 7.8 }, notes: '' },
  ]
  const { errors } = await bootApp(page, { db: { 'tests.json': JSON.stringify(tests) } })
  await goTab(page, 'history')
  for (const name of ['Free chlorine', 'pH']) {
    const row = page.locator('#main .card').first().locator('> div').filter({ has: page.locator('b', { hasText: new RegExp(`^${name}$`) }) })
    await expect(row.locator('svg.spark circle')).toHaveCount(2)
    await expect(row.locator('.timeline')).toHaveCount(0)
  }
  expect(errors, errors.join('\n')).toEqual([])
})

test('tests saved as words still render in history beside the new numbers', async ({ page }) => {
  // The fixture holds one old words test (fc low, ph/ta normal) and one numbers
  // test. Free chlorine has both kinds: the line for the number, the dot for
  // the word — neither hides the other. No migration of the old record.
  const { errors } = await bootApp(page)
  await goTab(page, 'history')
  const fc = page.locator('#main .card').first().locator('> div').filter({ has: page.locator('b', { hasText: /^Free chlorine$/ }) })
  await expect(fc.locator('svg.spark')).toHaveCount(1)
  await expect(fc.locator('.timeline .dot')).toHaveCount(1)
  await expect(fc).toContainText('Earlier tests, logged as words')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a test saved as words still gets advice, unmigrated', async ({ page }) => {
  const onlyWords = JSON.parse(fixture('tests.json')).slice(0, 1)
  const { mock, errors } = await bootApp(page, { db: { 'tests.json': JSON.stringify(onlyWords) } })
  const latest = page.locator('.card', { has: page.locator('h2', { hasText: 'Latest test' }) })
  await expect(latest).toContainText('Chlorine low')
  expect((await committed(mock, 'tests.json'))[0]).toEqual(onlyWords[0])
  expect(errors, errors.join('\n')).toEqual([])
})

test('the AI export carries a strip test as numbers', async ({ page }) => {
  const tests = [
    { id: 's1', date: '2026-07-13', at: '2026-07-13T12:00:00Z', by: 'x', mode: 'strip', levels: {}, nums: { fc: 3, cya: 100 }, notes: '' },
  ]
  const { errors } = await bootApp(page, { db: { 'tests.json': JSON.stringify(tests) } })
  await goTab(page, 'settings')
  await page.getByRole('button', { name: 'Export for AI review' }).click()
  const text = await page.locator('.modal-ov textarea').inputValue()
  const data = JSON.parse(text.slice(text.indexOf('DATA (JSON):') + 'DATA (JSON):'.length))
  expect(data.tests).toEqual([{ date: '2026-07-13', mode: 'strip', levels: {}, nums: { fc: 3, cya: 100 }, notes: '' }])
  expect(errors, errors.join('\n')).toEqual([])
})

test('a pad scale is editable in Settings for a different brand of strip', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'settings')
  const ch = page.locator('.scl[data-key="ch"]')
  await expect(ch).toHaveValue('0, 100, 250, 500')

  // Nonsense is refused and nothing is written.
  await ch.fill('0, lots, 500')
  await page.getByRole('button', { name: 'Save strip scales' }).click()
  await expect(page.locator('#toast')).toContainText('Total hardness')
  expect((await committed(mock, 'config.json')).stripScales).toBeUndefined()

  // A new brand's scale — typed out of order — is saved sorted.
  await ch.fill('1000 500, 0 250 120 50')
  await page.locator('.scl[data-key="fc"]').fill('')
  await page.getByRole('button', { name: 'Save strip scales' }).click()
  await expect.poll(async () => (await committed(mock, 'config.json')).stripScales).toEqual({
    ch: [0, 50, 120, 250, 500, 1000],
    tc: [0, 0.5, 1, 3, 5, 10],
    br: [0, 1, 2, 6, 10, 20],
    ph: [6.2, 6.8, 7.2, 7.8, 8.4],
    ta: [0, 40, 80, 120, 180, 240],
    cya: [0, 30, 100, 150, 300],
  })
  // Cleared = back to the bottle's default, shown filled back in.
  await expect(page.locator('.scl[data-key="fc"]')).toHaveValue('0, 0.5, 1, 3, 5, 10')

  await goTab(page, 'test')
  expect(await values(page, 'ch', 'v')).toEqual([0, 50, 120, 250, 500, 1000])
  expect(errors, errors.join('\n')).toEqual([])
})
