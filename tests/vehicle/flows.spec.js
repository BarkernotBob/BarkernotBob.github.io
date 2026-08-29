const { test, expect } = require('@playwright/test')
const { bootApp, goTab, stored } = require('./support/boot')

// One smoke test per main flow. Every change here has to reach localStorage —
// that single key IS the app's memory, so "it worked" always means the saved
// state changed, asserted through stored(), not just what is on screen.

test('editing an assumption saves it and re-renders every card', async ({ page }) => {
  const { errors } = await bootApp(page)

  // The assumptions are native prompt() dialogs.
  page.once('dialog', (d) => d.accept('20000'))
  await page.locator('[data-assume="annualMiles"]').click()

  await expect.poll(async () => (await stored(page)).settings.annualMiles).toBe(20000)
  await expect(page.locator('[data-assume="annualMiles"]')).toContainText('20,000 mi/yr')
  expect(errors, errors.join('\n')).toEqual([])
})

test('cancelling an assumption prompt changes nothing', async ({ page }) => {
  const { errors } = await bootApp(page)
  const before = (await stored(page)).settings.annualMiles

  page.once('dialog', (d) => d.dismiss())
  await page.locator('[data-assume="annualMiles"]').click()

  await expect(page.locator('[data-assume="annualMiles"]')).toContainText('12,000 mi/yr')
  expect((await stored(page)).settings.annualMiles).toBe(before)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a non-numeric assumption is refused, not saved as NaN', async ({ page }) => {
  // parseFloat("abc") is NaN, and a NaN in settings silently poisons every
  // figure in the app — every cost would render as $NaN or $0.
  const { errors } = await bootApp(page)

  page.once('dialog', (d) => d.accept('not a number'))
  await page.locator('[data-assume="fuelPrice"]').click()

  await expect(page.locator('#toast')).toContainText('Enter a number')
  expect((await stored(page)).settings.fuelPrice).toBe(3.5)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a percentage assumption is stored as a fraction', async ({ page }) => {
  // Inflation and sales tax are typed as percentages and stored as fractions.
  // Getting this backwards is a 100x error that still renders plausibly.
  const { errors } = await bootApp(page)

  page.once('dialog', (d) => d.accept('4.5'))
  await page.locator('[data-assume="inflation"]').click()

  await expect.poll(async () => (await stored(page)).settings.inflation).toBeCloseTo(0.045, 5)
  await expect(page.locator('[data-assume="inflation"]')).toContainText('4.5%')
  expect(errors, errors.join('\n')).toEqual([])
})

test('adding a vehicle lands you in its data tab, saved', async ({ page }) => {
  const { errors } = await bootApp(page)

  await page.locator('#addVeh').click()
  await page.getByRole('button', { name: 'Add blank vehicle' }).or(page.locator('#addManual')).first().click()

  await expect.poll(async () => (await stored(page)).vehicles.length).toBe(4)
  const added = (await stored(page)).vehicles.at(-1)
  expect(added.name).toBe('New vehicle')
  // It drops you straight into the data tab, because a blank car is useless
  // until its numbers are filled in.
  await expect(page.locator('#abTitle')).toHaveText('New vehicle')
  await expect(page.locator('#f_name')).toBeVisible()
  expect(errors, errors.join('\n')).toEqual([])
})

test('renaming a vehicle in the data tab persists', async ({ page }) => {
  const { errors } = await bootApp(page)

  await page.locator('.vcard').first().click()
  await page.locator('[data-vt="data"]').click()
  await page.fill('#f_name', 'Renamed Car')
  await page.locator('#f_name').blur()

  await expect.poll(async () => (await stored(page)).vehicles[0].name).toBe('Renamed Car')

  await page.reload()
  await goTab(page, 'garage')
  await expect(page.locator('#app')).toContainText('Renamed Car')
  expect(errors, errors.join('\n')).toEqual([])
})

test('changing MPG changes the modelled cost', async ({ page }) => {
  // The point of the whole app is that the numbers move when the inputs do.
  // A view that renders but never recomputes would pass every other test here.
  const { errors } = await bootApp(page)

  await page.locator('.vcard').filter({ hasText: 'Foobar Commuter' }).click()
  const before = await page.locator('#app .view').innerText()

  await page.locator('[data-vt="data"]').click()
  await page.fill('#f_mpg', '10')
  await page.locator('#f_mpg').blur()
  await expect.poll(async () => (await stored(page)).vehicles[1].mpg).toBe(10)

  await page.locator('[data-vt="overview"]').click()
  const after = await page.locator('#app .view').innerText()
  expect(after, 'the overview did not change after a 3x worse MPG').not.toBe(before)
  expect(errors, errors.join('\n')).toEqual([])
})

test('deleting a vehicle removes it once confirmed', async ({ page }) => {
  const { errors } = await bootApp(page)

  await page.locator('.vcard').filter({ hasText: 'Foobar Commuter' }).click()
  await page.locator('[data-vt="data"]').click()

  page.once('dialog', (d) => d.accept())
  await page.locator('#delVeh').click()

  await expect.poll(async () => (await stored(page)).vehicles.length).toBe(2)
  await expect(page.locator('#app')).toContainText('2 vehicles')
  await expect(page.locator('#app')).not.toContainText('Foobar Commuter')
  expect(errors, errors.join('\n')).toEqual([])
})

test('declining the delete confirm keeps the vehicle', async ({ page }) => {
  const { errors } = await bootApp(page)

  await page.locator('.vcard').filter({ hasText: 'Foobar Commuter' }).click()
  await page.locator('[data-vt="data"]').click()

  page.once('dialog', (d) => d.dismiss())
  await page.locator('#delVeh').click()

  await expect(page.locator('#abTitle')).toHaveText('Foobar Commuter')
  expect((await stored(page)).vehicles).toHaveLength(3)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a depreciation row can be added and removed', async ({ page }) => {
  const { errors } = await bootApp(page)

  await page.locator('.vcard').first().click()
  await page.locator('[data-vt="data"]').click()
  const rowsBefore = (await stored(page)).vehicles[0].rows.length

  await page.locator('#addRow').click()
  await expect.poll(async () => (await stored(page)).vehicles[0].rows.length).toBe(rowsBefore + 1)

  await page.locator('.dt-del').last().click()
  await expect.poll(async () => (await stored(page)).vehicles[0].rows.length).toBe(rowsBefore)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the purchase point drives the projection', async ({ page }) => {
  const { errors } = await bootApp(page)

  await page.locator('.vcard').first().click()
  await expect(page.locator('#pyMY')).toBeVisible()

  await page.selectOption('#pyMY', '2019').catch(async () => {
    await page.fill('#pyMY', '2019')
    await page.locator('#pyMY').blur()
  })

  await expect.poll(async () => (await stored(page)).vehicles[0].purchase.modelYear).toBe(2019)
  expect(errors, errors.join('\n')).toEqual([])
})

test('compare starts with everything selected and chips toggle', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'compare')

  // With nothing chosen yet the view pre-selects up to three vehicles, so it is
  // useful on arrival rather than an empty chart.
  const chips = page.locator('[data-sel]')
  await expect(chips).toHaveCount(3)
  await expect(page.locator('[data-sel].on')).toHaveCount(3)

  await chips.first().click()
  await expect(page.locator('[data-sel].on')).toHaveCount(2)
  await expect.poll(async () => (await stored(page)).compare.length).toBe(2)

  await chips.first().click()
  await expect(page.locator('[data-sel].on')).toHaveCount(3)
  await expect(page.locator('#app')).toContainText('Testa Voltage')
  expect(errors, errors.join('\n')).toEqual([])
})

test('compare refuses to deselect the last vehicle', async ({ page }) => {
  // Guarded in the click handler. Without it the chart has no series and the
  // screen goes blank with no way back except selecting something again.
  const { errors } = await bootApp(page)
  await goTab(page, 'compare')

  const chips = page.locator('[data-sel]')
  await chips.nth(0).click()
  await chips.nth(1).click()
  await expect(page.locator('[data-sel].on')).toHaveCount(1)

  // The one still selected — clicking it must be a no-op.
  await page.locator('[data-sel].on').click()
  await expect(page.locator('[data-sel].on')).toHaveCount(1)
  expect((await stored(page)).compare).toHaveLength(1)
  expect(errors, errors.join('\n')).toEqual([])
})

test('compare tells you when there is nothing to compare', async ({ page }) => {
  const { errors } = await bootApp(page, {
    mutate: (s) => {
      s.vehicles = s.vehicles.slice(0, 1)
      s.compare = []
    },
  })
  await goTab(page, 'compare')

  await expect(page.locator('#app')).toContainText('Add at least two vehicles')
  expect(errors, errors.join('\n')).toEqual([])
})

test('resetting to samples replaces the garage, once confirmed', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'settings')

  page.once('dialog', (d) => d.accept())
  await page.locator('#resetBtn').click()

  await expect.poll(async () => (await stored(page)).vehicles.length).toBeGreaterThan(3)
  await expect(page.locator('#app')).not.toContainText('Testa Voltage')
  expect(errors, errors.join('\n')).toEqual([])
})

test('declining the reset keeps your garage', async ({ page }) => {
  // The one genuinely destructive button in the app — it throws away every
  // vehicle you entered by hand.
  const { errors } = await bootApp(page)
  await goTab(page, 'settings')

  page.once('dialog', (d) => d.dismiss())
  await page.locator('#resetBtn').click()

  expect((await stored(page)).vehicles).toHaveLength(3)
  await goTab(page, 'garage')
  await expect(page.locator('#app')).toContainText('Testa Voltage')
  expect(errors, errors.join('\n')).toEqual([])
})

test('the model explainer opens', async ({ page }) => {
  const { errors } = await bootApp(page)

  let text = ''
  page.once('dialog', (d) => {
    text = d.message()
    d.accept()
  })
  await page.locator('#aboutModel').click()

  await expect.poll(async () => text).toContain('depreciation')
  expect(errors, errors.join('\n')).toEqual([])
})
