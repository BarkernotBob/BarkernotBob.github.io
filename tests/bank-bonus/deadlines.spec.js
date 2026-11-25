const { test, expect } = require('@playwright/test')
const fs = require('fs')
const path = require('path')
const { bootApp, goTab } = require('./support/boot')

// Issue #14: deadlines worked out from each account's terms, a reopen date set
// when an account is closed, and per-person eligibility on Offers.
//
// Fixture terms: Openbank One opened 2026-07-29 with 90 days to meet the
// requirements (due 2026-10-27, unpaid); Second Savings opened 2026-08-13 with
// 60 days (due 2026-10-12, unpaid); Closed Cooperative (Sam) closed with
// reopenAfter 2026-11-01.

const FIX = path.join(__dirname, 'fixtures', 'db')
const load = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'))
const accountsInStore = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('bb_local_db/accounts.json') || '[]'))

async function bootAt(page, iso, seed) {
  await page.clock.setFixedTime(new Date(iso + 'T17:00:00Z'))
  await page.addInitScript(() => {
    window.__badge = null
    navigator.setAppBadge = (n) => { window.__badge = n; return Promise.resolve() }
    navigator.clearAppBadge = () => { window.__badge = 0; return Promise.resolve() }
  })
  return bootApp(page, seed ? { seed } : {})
}

test('Today lists requirement deadlines coming up and recently missed', async ({ page }) => {
  const { errors } = await bootAt(page, '2026-10-20')
  const card = page.locator('#section-today .card', { hasText: 'Deadlines' })
  const soon = card.locator('.list-item', { hasText: 'Openbank One' })
  await expect(soon).toContainText('Requirements due 10/27/26')
  await expect(soon).toContainText('in 7 days')
  const missed = card.locator('.list-item', { hasText: 'Second Savings' })
  await expect(missed).toContainText('Requirements due 10/12/26')
  await expect(missed.locator('.late')).toHaveText('8 days overdue')
  // Deadlines ahead or past are a heads-up: only the overdue planned open counts.
  await expect.poll(() => page.evaluate(() => window.__badge)).toBe(1)
  expect(errors).toEqual([])
})

test('a paid bonus or a deadline long past drops off Today', async ({ page }) => {
  await bootAt(page, '2026-12-15')
  // Openbank One's deadline is 49 days past: missed, not news any more.
  await expect(page.locator('#section-today')).not.toContainText('Requirements due')
})

test('a bonus already paid drops its requirement deadline from Today', async ({ page }) => {
  const accounts = load('accounts.json')
  accounts.find((x) => x.id === 'a_open_1').dates.bonusPaidOut = '2026-10-15'
  await bootAt(page, '2026-10-20', { 'bb_local_db/accounts.json': JSON.stringify(accounts) })
  const card = page.locator('#section-today .card', { hasText: 'Deadlines' })
  await expect(card).toContainText('Second Savings')
  await expect(card).not.toContainText('Openbank One')
})

test('a quick date edit on Active moves the card\'s deadline at once', async ({ page }) => {
  await bootAt(page, '2026-10-01')
  await goTab(page, 'active')
  const card = page.locator('#section-active .card', { hasText: 'Openbank One' })
  await expect(card.locator('.deadline-line')).toHaveText('Requirements by 10/27/26')
  await card.locator('input.date-quick[data-a2="opened"]').fill('2026-08-10')
  await expect(page.locator('#section-active .card', { hasText: 'Openbank One' }).locator('.deadline-line'))
    .toHaveText('Requirements by 11/08/26')
})

test('a closed account with terms but no saved reopen date shows on Today when due', async ({ page }) => {
  const accounts = load('accounts.json')
  const a = accounts.find((x) => x.id === 'a_closed_1')
  a.dates.reopenAfter = null // as imported: terms say 12 months from the 2025-10-02 payout
  await bootAt(page, '2026-11-25', { 'bb_local_db/accounts.json': JSON.stringify(accounts) })
  const card = page.locator('#section-today .card', { hasText: 'Eligible to Reopen' })
  await expect(card.locator('.list-item', { hasText: 'Closed Cooperative' })).toContainText('since 10/02/26')
})

test('emptying a filled-in reopen date keeps it empty', async ({ page }) => {
  const accounts = load('accounts.json')
  const a = accounts.find((x) => x.id === 'a_closed_1')
  a.reopenAutoFrom = a.dates.reopenAfter // the app filled it in
  await bootAt(page, '2026-11-25', { 'bb_local_db/accounts.json': JSON.stringify(accounts) })
  await page.locator('#section-today .list-item', { hasText: 'Closed Cooperative' }).click()
  await page.locator('#d_date_reopenAfter').fill('')
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.locator('.toast')).toContainText('Saved')
  const saved = (await accountsInStore(page)).find((x) => x.id === 'a_closed_1')
  expect(saved.dates.reopenAfter).toBeNull()
  expect(saved.reopenAutoOff).toBe(true)
})

test('the open account card shows its deadlines', async ({ page }) => {
  const accounts = load('accounts.json')
  const a = accounts.find((x) => x.id === 'a_open_1')
  a.minBalDays = 60 // from first DD 2026-08-18
  await bootAt(page, '2026-10-01', { 'bb_local_db/accounts.json': JSON.stringify(accounts) })
  await goTab(page, 'active')
  const card = page.locator('#section-active .card', { hasText: 'Openbank One' })
  await expect(card.locator('.deadline-line')).toHaveText(
    'Requirements by 10/27/26 · Keep the minimum balance until 10/17/26'
  )
})

test('closing an account sets its reopen date from the terms', async ({ page }) => {
  const accounts = load('accounts.json')
  accounts.find((x) => x.id === 'a_paid_1').monthsTillReopen = 12 // paid 2026-06-29
  const { errors } = await bootAt(page, '2026-11-25', { 'bb_local_db/accounts.json': JSON.stringify(accounts) })
  await goTab(page, 'active')
  await page.locator('#section-active .card', { hasText: 'Paid Out Bank' }).locator('.card-title').click()
  await page.getByRole('button', { name: 'Close Account' }).click()
  await page.locator('.modal-ov').getByRole('button', { name: 'Close Account' }).click()
  await expect.poll(async () => (await accountsInStore(page)).find((x) => x.id === 'a_paid_1').status).toBe('closed')
  const saved = (await accountsInStore(page)).find((x) => x.id === 'a_paid_1')
  expect(saved.dates.closed).toBe('2026-11-25')
  expect(saved.dates.reopenAfter).toBe('2027-06-29')
  expect(errors).toEqual([])
})

test('saving an account that is still open gives it no reopen date', async ({ page }) => {
  const accounts = load('accounts.json')
  accounts.find((x) => x.id === 'a_paid_1').monthsTillReopen = 6
  await bootAt(page, '2026-11-25', { 'bb_local_db/accounts.json': JSON.stringify(accounts) })
  await goTab(page, 'active')
  await page.locator('#section-active .card', { hasText: 'Paid Out Bank' }).locator('.card-title').click()
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await expect(page.locator('.toast')).toContainText('Saved')
  expect((await accountsInStore(page)).find((x) => x.id === 'a_paid_1').dates.reopenAfter).toBeNull()
})

test('a reopen date typed in by hand is kept', async ({ page }) => {
  const accounts = load('accounts.json')
  const a = accounts.find((x) => x.id === 'a_paid_1')
  a.monthsTillReopen = 12
  a.dates.reopenAfter = '2027-01-15' // set by hand, not from the terms
  await bootAt(page, '2026-11-25', { 'bb_local_db/accounts.json': JSON.stringify(accounts) })
  await goTab(page, 'active')
  await page.locator('#section-active .card', { hasText: 'Paid Out Bank' }).locator('.card-title').click()
  await page.getByRole('button', { name: 'Close Account' }).click()
  await page.locator('.modal-ov').getByRole('button', { name: 'Close Account' }).click()
  await expect.poll(async () => (await accountsInStore(page)).find((x) => x.id === 'a_paid_1').status).toBe('closed')
  expect((await accountsInStore(page)).find((x) => x.id === 'a_paid_1').dates.reopenAfter).toBe('2027-01-15')
})

test('Offers show who is eligible, and the promote dialog says so', async ({ page }, testInfo) => {
  const offers = load('offers.json')
  const base = offers[0]
  offers.push(
    { ...base, id: 'o_coop', institution: 'Closed Cooperative', notes: '' },
    { ...base, id: 'o_paid', institution: 'Paid Out Bank, N.A.', notes: '' },
    { ...base, id: 'o_second', institution: 'Second Savings Bank', notes: '' }
  )
  const accounts = load('accounts.json')
  // Me had Second Savings once; nobody knows when it can be reopened.
  accounts.push({ ...accounts.find((x) => x.id === 'a_open_2'), id: 'a_old_me', person: 'Me', status: 'closed',
    dates: { plannedOpen: null, opened: '2024-01-10', firstDD: null, bonusPaidOut: '2024-03-01', closed: '2024-06-01', reopenAfter: null } })
  const { errors } = await bootAt(page, '2026-10-01', {
    'bb_local_db/offers.json': JSON.stringify(offers),
    'bb_local_db/accounts.json': JSON.stringify(accounts),
  })
  await goTab(page, 'offers')
  const elig = (name) => page.locator('#section-offers .card', { hasText: name }).locator('.elig')
  await expect(elig('Fixture Federal Credit Union')).toHaveText('✓ Me: eligible✓ Sam: eligible')
  await expect(elig('Closed Cooperative')).toContainText('⏳ Sam: from 11/01/26')
  await expect(elig('Closed Cooperative')).toContainText('✓ Me: eligible')
  await expect(elig('Paid Out Bank')).toContainText('• Me: has one open')
  await expect(elig('Second Savings Bank')).toContainText('• Sam: has one open')
  await expect(elig('Second Savings Bank')).toContainText('? Me: had one, check terms')
  await page.locator('#section-offers .card', { hasText: 'Closed Cooperative' }).screenshot({
    path: path.join(__dirname, 'screenshots', 'offers-eligibility.png'),
  })
  await testInfo.attach('offers-eligibility', { path: path.join(__dirname, 'screenshots', 'offers-eligibility.png'), contentType: 'image/png' })

  await page.locator('#section-offers .card', { hasText: 'Closed Cooperative' })
    .getByRole('button', { name: 'Move to Planned' }).click()
  const dialog = page.locator('.modal-ov')
  await expect(dialog.getByRole('button', { name: /^Sam/ })).toContainText('(from 11/01/26)')
  await expect(dialog.getByRole('button', { name: 'Me', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('after the reopen date, a past account makes the person eligible again', async ({ page }) => {
  const offers = load('offers.json')
  offers.push({ ...offers[0], id: 'o_coop', institution: 'Closed Cooperative', notes: '' })
  await bootAt(page, '2026-11-25', { 'bb_local_db/offers.json': JSON.stringify(offers) })
  await goTab(page, 'offers')
  await expect(page.locator('#section-offers .card', { hasText: 'Closed Cooperative' }).locator('.elig'))
    .toContainText('✓ Sam: eligible again')
})

test('a newer account with no reopen rule outweighs an older reopen date', async ({ page }) => {
  const offers = load('offers.json')
  offers.push({ ...offers[0], id: 'o_coop', institution: 'Closed Cooperative', notes: '' })
  const accounts = load('accounts.json')
  const old = accounts.find((x) => x.id === 'a_closed_1') // reopen 2026-11-01
  accounts.push({ ...old, id: 'a_closed_2', monthsTillReopen: null,
    dates: { plannedOpen: null, opened: '2026-05-01', firstDD: null, bonusPaidOut: null, closed: '2026-11-10', reopenAfter: null } })
  await bootAt(page, '2026-11-25', {
    'bb_local_db/offers.json': JSON.stringify(offers),
    'bb_local_db/accounts.json': JSON.stringify(accounts),
  })
  await goTab(page, 'offers')
  await expect(page.locator('#section-offers .card', { hasText: 'Closed Cooperative' }).locator('.elig'))
    .toContainText('? Sam: had one, check terms')
})

test('bank names match their short forms, but a bank and a credit union stay apart', async ({ page }) => {
  const offers = load('offers.json')
  const accounts = load('accounts.json')
  const open = accounts.find((x) => x.id === 'a_open_1')
  ;['Navy Federal', 'Alliant', 'Ally Bank', 'Citizens Bank'].forEach((name, i) =>
    accounts.push({ ...open, id: 'a_name_' + i, institution: name, offerId: null }))
  ;['Navy Federal Credit Union', 'Alliant Credit Union', 'Ally', 'Citizens FCU'].forEach((name, i) =>
    offers.push({ ...offers[0], id: 'o_name_' + i, institution: name, notes: '' }))
  await bootAt(page, '2026-11-25', {
    'bb_local_db/offers.json': JSON.stringify(offers),
    'bb_local_db/accounts.json': JSON.stringify(accounts),
  })
  await goTab(page, 'offers')
  const elig = (name) => page.locator('#section-offers .card', { hasText: name }).locator('.elig')
  await expect(elig('Navy Federal Credit Union')).toContainText('• Me: has one open')
  await expect(elig('Alliant Credit Union')).toContainText('• Me: has one open')
  await expect(elig('Citizens FCU')).toContainText('✓ Me: eligible')
})
