const { test, expect } = require('@playwright/test')
const { bootApp, goTab } = require('./support/boot')

// GAP-W2 class 2: a smoke test per main flow. Each one asserts the change
// actually landed in the browser store, not just that a screen redrew — a
// render that forgets to save is exactly the class of bug that used to get
// found on a phone.

const accountsInStore = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('bb_local_db/accounts.json') || '[]'))
const offersInStore = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('bb_local_db/offers.json') || '[]'))
const configInStore = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('bb_local_db/config.json') || '{}'))

test('Today summarises the fixtures: 3 open, 1 planned, 1 closed', async ({ page }) => {
  // Pinned to a day when nothing in the fixtures is due, so the summary shows.
  await page.clock.setFixedTime(new Date('2026-08-20T16:00:00Z'))
  await bootApp(page)
  const today = page.locator('#section-today')
  await expect(today).toContainText('5 accounts')
  const text = await today.innerText()
  // Rendered as a label above its number, so assert on the pairing.
  expect(text).toMatch(/OPEN\s*\n?\s*3/)
  expect(text).toMatch(/PLANNED\s*\n?\s*1/)
  expect(text).toMatch(/CLOSED\s*\n?\s*1/)
})

test('Active: the Closed filter swaps which accounts are listed', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'active')
  const active = page.locator('#section-active')
  await active.getByText('Closed', { exact: true }).first().click()
  await expect(active).toContainText('Closed Cooperative')
  await expect(active).not.toContainText('Openbank One')
  await active.getByText('Open', { exact: true }).first().click()
  await expect(active).toContainText('Openbank One')
  await expect(active).not.toContainText('Closed Cooperative')
  expect(errors, errors.join('\n')).toEqual([])
})

test('Active: the person filter narrows to one person', async ({ page }) => {
  await bootApp(page)
  await goTab(page, 'active')
  const active = page.locator('#section-active')
  await active.getByText('Sam', { exact: true }).first().click()
  await expect(active).toContainText('Second Savings') // Sam's
  await expect(active).not.toContainText('Openbank One') // Me's
  await active.getByText('Everyone', { exact: true }).first().click()
  await expect(active).toContainText('Openbank One')
})

test('Planned: "Mark as opened" opens the account and saves it', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'planned')
  await page.getByRole('button', { name: 'Mark as opened' }).first().click()

  await expect
    .poll(async () => (await accountsInStore(page)).find((a) => a.id === 'a_planned_1').status)
    .toBe('open')
  const acct = (await accountsInStore(page)).find((a) => a.id === 'a_planned_1')
  expect(acct.dates.opened, 'opening an account must stamp the date').toBeTruthy()

  // And it has moved between the two views.
  await goTab(page, 'active')
  await expect(page.locator('#section-active')).toContainText('Planned Provident')
  await goTab(page, 'planned')
  await expect(page.locator('#section-planned')).not.toContainText('Planned Provident')
  expect(errors, errors.join('\n')).toEqual([])
})

test('Offers: promoting an offer creates a tracked account for the chosen person', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'offers')
  const before = (await accountsInStore(page)).length

  await page.getByRole('button', { name: 'Move to Planned' }).first().click()
  // It asks who is opening it before creating anything.
  const dialog = page.locator('.modal-ov')
  await expect(dialog).toContainText('Fixture Federal Credit Union')
  await dialog.getByRole('button', { name: 'Sam', exact: true }).click()

  await expect.poll(async () => (await accountsInStore(page)).length).toBe(before + 1)
  const created = (await accountsInStore(page)).at(-1)
  expect(created.institution).toBe('Fixture Federal Credit Union')
  expect(created.person).toBe('Sam')
  expect(created.status).toBe('planned')
  // Carries the offer's terms across, and remembers where it came from.
  expect(created.bonus).toBe(300)
  expect(created.directDepositTotal).toBe(1000)
  expect(created.offerId).toBe('seed_test_01')
  expect(errors, errors.join('\n')).toEqual([])
})

test('Offers: an offer can be deleted', async ({ page }) => {
  await bootApp(page)
  await goTab(page, 'offers')
  const before = (await offersInStore(page)).length
  page.once('dialog', (d) => d.accept()) // in case deletion confirms
  await page.getByRole('button', { name: 'Delete' }).first().click()
  const dialog = page.locator('.modal-ov')
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole('button', { name: /delete|yes|remove|confirm/i }).first().click()
  }
  await expect.poll(async () => (await offersInStore(page)).length).toBe(before - 1)
})

test('Active: a new account can be added by hand', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'active')
  const before = (await accountsInStore(page)).length

  await page.getByRole('button', { name: '+ Add Account' }).first().click()
  const dialog = page.locator('.modal-ov')
  await dialog.locator('#na_inst').fill('Hand Typed Bank')
  await dialog.locator('#na_person').selectOption('Me')
  await dialog.locator('#na_bonus').fill('750')
  await dialog.locator('#na_dd').fill('2000')
  await dialog.getByRole('button', { name: 'Add', exact: true }).click()

  await expect.poll(async () => (await accountsInStore(page)).length).toBe(before + 1)
  const created = (await accountsInStore(page)).at(-1)
  expect(created.institution).toBe('Hand Typed Bank')
  expect(created.bonus).toBe(750)
  expect(created.directDepositTotal).toBe(2000)
  expect(errors, errors.join('\n')).toEqual([])
})

test('Offers: a new offer can be added by hand', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'offers')
  const before = (await offersInStore(page)).length

  await page.getByRole('button', { name: '+ Add Offer' }).first().click()
  const dialog = page.locator('.modal-ov')
  await dialog.locator('#off_inst').fill('Typed Offer Bank')
  await dialog.locator('#off_bonus').fill('425')
  await dialog.locator('#off_dd').fill('1500')
  await dialog.getByRole('button', { name: /^(Add|Save)$/ }).first().click()

  await expect.poll(async () => (await offersInStore(page)).length).toBe(before + 1)
  const created = (await offersInStore(page)).at(-1)
  expect(created.institution).toBe('Typed Offer Bank')
  expect(created.bonus).toBe(425)
  expect(created.directDepositTotal).toBe(1500)
  expect(errors, errors.join('\n')).toEqual([])
})

test('Reports: the money adds up to the fixtures', async ({ page }) => {
  await bootApp(page)
  await goTab(page, 'reports')
  const reports = page.locator('#section-reports')
  // Fixtures: earned = closed 250 + paid-but-open 400 = 650; pending = open
  // unpaid 300+500 = 800; planned 200; total 1650. (#15: a paid bonus on an
  // open account is earned, not pending.)
  const row = (label) => reports.locator('tr', { hasText: label })
  await expect(row('Earned (paid or closed)')).toContainText('$650.00')
  await expect(row('Earned (paid or closed)').locator('td').last()).toHaveText('2')
  await expect(row('Pending (open, unpaid)')).toContainText('$800.00')
  await expect(row('Pending (open, unpaid)').locator('td').last()).toHaveText('2')
  await expect(row('Planned')).toContainText('$200.00')
  await expect(row('Total projected')).toContainText('$1,650.00')
  await expect(reports).toContainText('Earned includes 1 paid bonus on accounts still open')
  // After-tax at the fixture's 16.75% marginal rate.
  await expect(reports).toContainText('16.75%')
})

test('Calendar renders a month grid', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'calendar')
  await expect(page.locator('#section-calendar')).toContainText('Tap any day')
  expect(errors, errors.join('\n')).toEqual([])
})

test('Settings: switching person persists across a reload', async ({ page }) => {
  await bootApp(page)
  await goTab(page, 'settings')
  const settings = page.locator('#section-settings')
  await settings.locator('#set_me').selectOption('Sam')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('bb_me'))).toBe('Sam')
  await page.reload()
  await page.locator('.nav-btn[data-tab="today"]').waitFor({ state: 'visible' })
  expect(await page.evaluate(() => localStorage.getItem('bb_me'))).toBe('Sam')
})

test('Settings still says data is local until GitHub is connected', async ({ page }) => {
  await bootApp(page)
  await goTab(page, 'settings')
  await expect(page.locator('#section-settings')).toContainText('Saved on this device only')
  expect(await configInStore(page)).toBeTruthy()
})

test('Offers: an offer from the old sheet shows "Verify terms" until marked verified', async ({ page }, testInfo) => {
  const offers = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'db', 'offers.json'), 'utf8'))
  offers[0].needsVerification = true
  offers[0].notes = 'From the old sheet: verify current terms before opening.'
  const { errors } = await bootApp(page, { seed: { 'bb_local_db/offers.json': JSON.stringify(offers) } })
  await goTab(page, 'offers')
  const card = page.locator('#section-offers .card', { hasText: offers[0].institution })
  await expect(card.locator('.pill-verify')).toHaveText('Verify terms')
  await expect(card).toContainText('verify current terms')
  await expect(page.locator('#section-offers .pill-verify')).toHaveCount(1)
  await testInfo.attach('offers-verify-mobile.png', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' })
  await card.screenshot({ path: require('path').join(__dirname, 'screenshots', 'offers-verify-card.png') })
  await card.getByRole('button', { name: 'Mark verified' }).click()
  await expect.poll(async () => (await offersInStore(page))[0].needsVerification).toBeUndefined()
  // Updated in place (no reflow): pill hidden, button disabled; gone after a reload.
  await expect(card.locator('.pill-verify')).toBeHidden()
  await expect(card.getByRole('button', { name: 'Verified' })).toBeDisabled()
  await expect(card).toContainText('verify current terms')
  await page.reload()
  await goTab(page, 'offers')
  await expect(page.locator('#section-offers .pill-verify')).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})
