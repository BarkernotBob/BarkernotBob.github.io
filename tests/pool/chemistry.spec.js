const { test, expect } = require('@playwright/test')
const { bootApp, goTab, fixture } = require('./support/boot')

// The test form and the advice have to match the gear Isaiah actually owns:
// the seven pads on his strip, and the six chemicals in his shed (liquid
// chlorine, cal-hypo, 3" trichlor tabs, PR-10,000, Alkalinity Up, soda ash).
// Everything here guards one of those two facts. The failure this suite exists
// to catch is advice that tells him to dose something he doesn't have — or a
// strip pad quietly dropping off the form.

// His strip, in the order the pads read.
const STRIP_PADS = [
  'Total hardness',
  'Total chlorine',
  'Total bromine',
  'Free chlorine',
  'pH',
  'Total alkalinity',
  'Cyanuric acid',
]

// A config carrying only the six chemicals he has, so "not on hand" advice is
// asserted against a real inventory rather than the app's defaults.
function configWith(overrides = {}) {
  const c = JSON.parse(fixture('config.json'))
  c.chemicals = {
    onHand: {
      liquid_chlorine: true,
      cal_hypo: true,
      trichlor_tabs: true,
      phosphate_remover: true,
      alkalinity_up: true,
      soda_ash: true,
    },
  }
  return JSON.stringify({ ...c, ...overrides })
}

async function bootWithShed(page, extra = {}) {
  return bootApp(page, { db: { 'config.json': configWith(), ...extra } })
}

test('the strips form offers exactly the seven pads on his strip', async ({ page }) => {
  const { errors } = await bootWithShed(page)
  await goTab(page, 'test')

  const keys = await page.locator('#testForm .levels').evaluateAll((els) => els.map((e) => e.dataset.key))
  expect(keys).toEqual(['ch', 'tc', 'br', 'fc', 'ph', 'ta', 'cya'])
  for (const pad of STRIP_PADS) {
    await expect(page.locator('#testForm')).toContainText(pad)
  }
  // Phosphates are a Leslie's lab reading, not a strip pad.
  await expect(page.locator('#testForm')).not.toContainText('Phosphates')
  expect(errors, errors.join('\n')).toEqual([])
})

test('numbers mode keeps the seven pads and puts phosphates under a lab heading', async ({ page }) => {
  const { errors } = await bootWithShed(page)
  await goTab(page, 'test')
  await page.getByRole('button', { name: 'Numbers' }).click()

  const keys = await page.locator('#testForm .num').evaluateAll((els) => els.map((e) => e.dataset.key))
  expect(keys).toEqual(['ch', 'tc', 'br', 'fc', 'ph', 'ta', 'cya', 'po4'])
  await expect(page.locator('#testForm')).toContainText('Not on your strips')
  expect(errors, errors.join('\n')).toEqual([])
})

test('low chlorine is dosed with a chlorine he owns, not a generic product', async ({ page }) => {
  const { errors } = await bootWithShed(page)
  await goTab(page, 'test')

  await page.locator('.levels[data-key="fc"] button[data-l="low"]').click()
  await page.click('#t_save')

  const modal = page.locator('.modal-ov')
  await expect(modal).toContainText('Do now — nothing to buy')
  await expect(modal).toContainText(/cal-hypo|liquid chlorine/i)
  expect(errors, errors.join('\n')).toEqual([])
})

test('high hardness steers chlorine to liquid instead of cal-hypo', async ({ page }) => {
  const { errors } = await bootWithShed(page)
  await goTab(page, 'test')
  await page.getByRole('button', { name: 'Numbers' }).click()

  // Hardness over the 400 ppm ceiling, chlorine under the 1 ppm floor: cal-hypo
  // would add still more calcium, so the advice has to name the liquid.
  await page.locator('.num[data-key="ch"]').fill('520')
  await page.locator('.num[data-key="fc"]').fill('0.4')
  await page.click('#t_save')

  const modal = page.locator('.modal-ov')
  await expect(modal).toContainText('liquid chlorine')
  await expect(modal).toContainText('hardness is already high')
  expect(errors, errors.join('\n')).toEqual([])
})

test('high pH becomes a shopping note — he keeps no acid', async ({ page }) => {
  const { errors } = await bootWithShed(page)
  await goTab(page, 'test')

  await page.locator('.levels[data-key="ph"] button[data-l="high"]').click()
  await page.click('#t_save')

  const modal = page.locator('.modal-ov')
  await expect(modal).toContainText('To fully fix it')
  await expect(modal).toContainText('pH Down')
  // And the stopgap that uses what he does have.
  await expect(modal).toContainText('tabs')
  expect(errors, errors.join('\n')).toEqual([])
})

test('low alkalinity is fixed with the Alkalinity Up on his shelf', async ({ page }) => {
  const { errors } = await bootWithShed(page)
  await goTab(page, 'test')

  await page.locator('.levels[data-key="ta"] button[data-l="low"]').click()
  await page.click('#t_save')

  const modal = page.locator('.modal-ov')
  await expect(modal).toContainText('Do now — nothing to buy')
  await expect(modal).toContainText('Alkalinity Up')
  expect(errors, errors.join('\n')).toEqual([])
})

test('total chlorine above free chlorine is called out as chloramines', async ({ page }) => {
  const { errors } = await bootWithShed(page)
  await goTab(page, 'test')
  await page.getByRole('button', { name: 'Numbers' }).click()

  await page.locator('.num[data-key="tc"]').fill('3')
  await page.locator('.num[data-key="fc"]').fill('1')
  await page.click('#t_save')

  const modal = page.locator('.modal-ov')
  await expect(modal).toContainText('Combined chlorine is 2 ppm')
  await expect(modal).toContainText(/shock/i)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the bromine pad is informational and never counted as off target', async ({ page }) => {
  const { errors } = await bootWithShed(page)
  await goTab(page, 'test')

  // "very low" on any real reading would be a danger card; on bromine, in a
  // chlorine pool, it means nothing and must not generate an action.
  await page.locator('.levels[data-key="br"] button[data-l="very low"]').click()
  await page.click('#t_save')

  const modal = page.locator('.modal-ov')
  await expect(modal).toContainText("you're in good shape")
  await expect(modal).not.toContainText('To fully fix it')
  expect(errors, errors.join('\n')).toEqual([])
})

test('settings lists his shed as stocked and the rest as unticked', async ({ page }) => {
  const { errors } = await bootWithShed(page)
  await goTab(page, 'settings')

  await expect(page.locator('#main')).toContainText('Your shed')
  for (const key of ['liquid_chlorine', 'cal_hypo', 'trichlor_tabs', 'phosphate_remover', 'alkalinity_up', 'soda_ash']) {
    await expect(page.locator(`.chem[data-key="${key}"]`)).toBeChecked()
  }
  for (const key of ['ph_down', 'muriatic_acid', 'cya', 'calcium']) {
    await expect(page.locator(`.chem[data-key="${key}"]`)).not.toBeChecked()
  }
  expect(errors, errors.join('\n')).toEqual([])
})

test('a config saved before the rename still knows what is in the shed', async ({ page }) => {
  // The fixture carries the old key names (chlorine_granular / ph_up). They
  // have to migrate on load, or the first advice after the update tells him to
  // go buy the chlorine already sitting in his shed.
  const { errors } = await bootApp(page)
  await goTab(page, 'settings')

  await expect(page.locator('.chem[data-key="cal_hypo"]')).toBeChecked()
  await expect(page.locator('.chem[data-key="phosphate_remover"]')).toBeChecked()
  await expect(page.locator('.chem[data-key="chlorine_granular"]')).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the new pads get target ranges an older config never had', async ({ page }) => {
  // The fixture's targets predate total chlorine and bromine. Settings has to
  // render their range inputs instead of throwing on a missing key.
  const { errors } = await bootApp(page)
  await goTab(page, 'settings')

  await expect(page.locator('.tgt[data-key="tc"][data-i="0"]')).toHaveValue('1')
  await expect(page.locator('.tgt[data-key="br"][data-i="1"]')).toHaveValue('4')
  expect(errors, errors.join('\n')).toEqual([])
})

test('low free chlorine and chloramines together give one dose, not two', async ({ page }) => {
  const { errors } = await bootWithShed(page)
  await goTab(page, 'test')
  await page.getByRole('button', { name: 'Numbers' }).click()

  await page.locator('.num[data-key="fc"]').fill('0.4')
  await page.locator('.num[data-key="tc"]').fill('1.8')
  await page.click('#t_save')

  const modal = page.locator('.modal-ov')
  await expect(modal).toContainText('one dose, not two')
  // Exactly one line in the do-now block tells him to go and pour something.
  const doNow = modal.locator('.rec', { hasText: 'Do now' })
  const doses = (await doNow.innerText()).match(/Add (about )?(1 cup|½ cup|2 quarts|1 quart)/g) || []
  expect(doses.length).toBe(1)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a routine chlorine top-up is not mistaken for the shock chloramines need', async ({ page }) => {
  const { errors } = await bootWithShed(page)
  await goTab(page, 'test')
  await page.getByRole('button', { name: 'Numbers' }).click()

  // 0.8 ppm free chlorine is low but not shock-low, so the free-chlorine card
  // prescribes a normal dose — which does not burn chloramines out. The
  // total-chlorine card has to ask for the shock itself.
  await page.locator('.num[data-key="fc"]').fill('0.8')
  await page.locator('.num[data-key="tc"]').fill('2.4')
  await page.click('#t_save')

  const modal = page.locator('.modal-ov')
  await expect(modal).toContainText('Combined chlorine is 1.6 ppm')
  await expect(modal).toContainText('Shock it')
  await expect(modal).not.toContainText('one dose, not two')
  expect(errors, errors.join('\n')).toEqual([])
})

test('unticking every chemical sticks — an empty shed is a real answer', async ({ page }) => {
  const empty = JSON.parse(fixture('config.json'))
  empty.chemicals = { onHand: {} }
  const { errors } = await bootApp(page, { db: { 'config.json': JSON.stringify(empty) } })
  await goTab(page, 'settings')

  // Not silently restocked on load…
  await expect(page.locator('.chem[data-key="cal_hypo"]')).not.toBeChecked()

  // …and the advice agrees: nothing to dose with, so it's all a shopping list.
  await goTab(page, 'test')
  await page.locator('.levels[data-key="fc"] button[data-l="low"]').click()
  await page.click('#t_save')
  const modal = page.locator('.modal-ov')
  await expect(modal).toContainText('To fully fix it')
  await expect(modal).not.toContainText('Do now — nothing to buy')
  expect(errors, errors.join('\n')).toEqual([])
})

test('the detail list is ordered like the action list', async ({ page }) => {
  // "the dose above" has to point at a card that is genuinely above: free
  // chlorine before total chlorine, not READINGS order (which puts tc first).
  const { errors } = await bootWithShed(page)
  await goTab(page, 'test')
  await page.getByRole('button', { name: 'Numbers' }).click()
  await page.locator('.num[data-key="fc"]').fill('0.2')
  await page.locator('.num[data-key="tc"]').fill('0.6')
  await page.click('#t_save')

  await page.locator('.modal-ov summary').click()
  const detail = await page.locator('.modal-ov details').innerText()
  expect(detail.indexOf('Free chlorine')).toBeLessThan(detail.indexOf('Total chlorine'))
  expect(errors, errors.join('\n')).toEqual([])
})

test('bromine history stays neutral, never a red off-target dot', async ({ page }) => {
  const tests = [
    { id: 't1', date: '2026-07-01', at: '2026-07-01T12:00:00Z', by: 'x', mode: 'qual', levels: { br: 'very low' }, nums: {}, notes: '' },
  ]
  const { errors } = await bootApp(page, {
    db: { 'config.json': configWith(), 'tests.json': JSON.stringify(tests) },
  })
  await goTab(page, 'history')

  const dots = page.locator('.timeline .dot')
  await expect(dots).toHaveCount(1)
  await expect(dots.first()).toHaveClass(/(^|\s)s0(\s|$)/)
  expect(errors, errors.join('\n')).toEqual([])
})
