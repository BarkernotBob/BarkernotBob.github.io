const { test, expect } = require('@playwright/test')
const { bootApp } = require('./support/boot')

// Slice S4 — the designed TODAY screen. Use-it-up reads ITEMS directly
// (status:active · perishable:true · useByDate ≤ today+3 in config.timezone),
// renders a 4-segment shelf-life bar + a text stamp, and its row actions
// (Used it / Tossed / Snooze) each write ONE atomic commit and mutate the
// affected row IN PLACE at fixed height — sibling rows never move (§13 class 2).
//
// Date stability: the app derives "today" from config.timezone at runtime, so we
// compute useByDate relative to NY-local today in Node and inject the items via
// the mock BEFORE boot (opts.itemsOverride). A ±1-day clock skew can't flip the
// classification because the sentinel dates sit well inside/outside the window.

const TZ = 'America/New_York' // matches fixtures/db/config.json
function today() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ }) // YYYY-MM-DD
}
function ymdNum(s) {
  const p = s.split('-').map(Number)
  return Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000)
}
function addDays(s, n) {
  return new Date((ymdNum(s) + n) * 86400000).toISOString().slice(0, 10)
}

function item(over) {
  return Object.assign(
    {
      id: 'i_x',
      receiptId: 'r_a',
      rawName: 'X',
      name: 'X',
      groupId: null,
      category: 'produce',
      qty: 1,
      unit: 'ea',
      unitPrice: 1,
      price: 1,
      store: 'Publix',
      storeId: 'publix',
      purchasedAt: addDays(today(), -3),
      perishable: true,
      useByDate: null,
      hsaEligible: false,
      status: 'active',
      flags: [],
    },
    over
  )
}

// One overdue (→ USE TODAY), one soon (→ USE BY), plus three that must NOT list.
function itemsFixture() {
  const t = today()
  return [
    item({ id: 'i_a', name: 'Rotisserie Chicken', qty: 1, unit: 'ct', purchasedAt: addDays(t, -6), useByDate: addDays(t, -1) }),
    item({ id: 'i_b', name: 'Strawberries', qty: 1, unit: 'lb', purchasedAt: addDays(t, -3), useByDate: addDays(t, 2) }),
    item({ id: 'i_far', name: 'Butter', useByDate: addDays(t, 10) }), // outside +3 window
    item({ id: 'i_np', name: 'Canned Beans', perishable: false, useByDate: null }), // non-perishable
    item({ id: 'i_gone', name: 'Old Spinach', useByDate: addDays(t, 1), status: 'consumed' }), // not active
  ]
}

// Two trips with distinct provenance sources for the SNAP/SYNC stamps.
function receiptsFixture() {
  const t = today()
  return [
    { id: 'r_a', photo: 'receipts/r_a.jpg', capturedAt: t + 'T12:00:00Z', capturedBy: 'Me', status: 'processed', store: 'Publix', storeId: 'publix', purchasedAt: t, total: 69.37, currency: 'USD', itemIds: ['i_a', 'i_b'], notes: '', source: 'photo', channel: 'in_store' },
    { id: 'r_b', photo: null, capturedAt: t + 'T09:00:00Z', capturedBy: 'Me', status: 'processed', store: 'Walmart', storeId: 'walmart', purchasedAt: addDays(t, -1), total: 112.48, currency: 'USD', itemIds: [], notes: '', source: 'extension', channel: 'pickup' },
  ]
}

function boot(page) {
  return bootApp(page, { mock: { itemsOverride: itemsFixture(), receiptsOverride: receiptsFixture() } })
}

test('Use-it-up lists only active perishables within today+3, most urgent first', async ({ page }) => {
  await boot(page)
  const rows = page.locator('.today-list .urow')
  await expect(rows).toHaveCount(2)
  await expect(page.locator('#urow_i_a')).toBeVisible()
  await expect(page.locator('#urow_i_b')).toBeVisible()
  // Excluded: outside window, non-perishable, non-active.
  await expect(page.locator('#urow_i_far')).toHaveCount(0)
  await expect(page.locator('#urow_i_np')).toHaveCount(0)
  await expect(page.locator('#urow_i_gone')).toHaveCount(0)
  // Ordered by useByDate ascending → overdue chicken first.
  await expect(rows.first()).toContainText('Rotisserie Chicken')
})

test('shelf-life bar + text stamp render (never colour-only)', async ({ page }) => {
  await boot(page)
  // Overdue → rotated USE TODAY stamp + a full tomato (hot) bar.
  const a = page.locator('#urow_i_a')
  await expect(a.locator('.stamp.today')).toContainText('Use today')
  await expect(a.locator('.sl-bar.lvl-hot')).toBeVisible()
  await expect(a.locator('.sl-bar i.on')).toHaveCount(4)
  // Soon → USE BY <date> stamp + a partially filled bar.
  const b = page.locator('#urow_i_b')
  await expect(b.locator('.stamp.useby')).toContainText('Use by')
  await expect(b.locator('.sl-bar')).toBeVisible()
})

test('sync-strip shows the pre-adapter empty state → Settings', async ({ page }) => {
  await boot(page)
  const strip = page.locator('.sync-empty')
  await expect(strip).toContainText('No connected stores yet')
  expect(await strip.getAttribute('data-arg')).toBe('settings')
})

test('provenance SNAP/SYNC stamps render on recent trips by source', async ({ page }) => {
  await boot(page)
  const trips = page.locator('.trips')
  await expect(trips.locator('.prov.snap')).toBeVisible() // photo source
  await expect(trips.locator('.prov.sync')).toBeVisible() // extension source
  await expect(trips).toContainText('pickup') // channel chip
})

for (const [kind, sel, doneWord] of [
  ['Used it', '[data-action="todayUsed"]', 'Used'],
  ['Tossed', '[data-action="todayTossed"]', 'Tossed'],
  ['Snooze', '[data-action="todaySnooze"]', 'Snoozed'],
]) {
  test(`${kind}: one commit, row mutates in place, siblings do not move`, async ({ page }) => {
    const { mock } = await boot(page)
    const sibling = page.locator('#urow_i_b')
    const before = await sibling.boundingBox()
    const commitsBefore = mock.commits.length

    // Act on the FIRST row (i_a); the row BELOW it (i_b) must not shift.
    await page.locator('#urow_i_a ' + sel).click()
    await expect(page.locator('#urow_i_a .urow-done')).toContainText(doneWord)

    // Exactly ONE atomic commit.
    expect(mock.commits.length - commitsBefore).toBe(1)

    // No-reflow: the sibling row's box is byte-identical (§13 class 2).
    const after = await sibling.boundingBox()
    expect(after).toEqual(before)
  })
}

test('Snooze pushes useByDate +2 days via a single commit', async ({ page }) => {
  const { mock } = await boot(page)
  await page.locator('#urow_i_b [data-action="todaySnooze"]').click()
  await expect(page.locator('#urow_i_b .urow-done')).toBeVisible()
  const items = JSON.parse(mock.readFile('db/items.json'))
  const b = items.find((i) => i.id === 'i_b')
  expect(b.useByDate).toBe(addDays(today(), 4)) // was today+2, snoozed +2
})
