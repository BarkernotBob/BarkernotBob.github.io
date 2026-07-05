const { test, expect } = require('@playwright/test')
const { bootApp } = require('./support/boot')

// Slice S1 (PRD §11.2 / §12 S1 DONE / §13). The data layer now sits on the Git
// Data API: atomic batched commits with delta-replay on ref races, blob reads
// with no 1 MB ceiling, and freshness polling that self-resolves "reading…".

test('mark-waste is ONE atomic commit across items+waste+reminders', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await page.click('nav [data-tab="search"]')
  await page.fill('#sq', 'milk') // i_milk_0001 is active + has a pending reminder
  await page.locator('#sresults .grp').first().click()
  await page.locator('#sresults [data-action="markWaste"]').first().click()
  await page.locator('.modal-card [data-mval="spoiled"]').click()
  await expect(page.locator('.toast')).toContainText('waste')

  // Exactly one commit (and one ref update) despite touching three files.
  expect(mock.commits.length).toBe(1)
  expect(mock.refUpdates).toBe(1)

  // All three files reflect the change in that single commit.
  const items = JSON.parse(mock.readFile('db/items.json'))
  const waste = JSON.parse(mock.readFile('db/waste.json'))
  const reminders = JSON.parse(mock.readFile('db/reminders.json'))
  expect(items.find((i) => i.id === 'i_milk_0001').status).toBe('thrown_away')
  expect(waste.some((w) => w.itemId === 'i_milk_0001')).toBe(true)
  expect(reminders.find((r) => r.id === 'rem_milk_0001').status).toBe('done')
  expect(errors).toEqual([])
})

test('no lost update: a concurrent writer between build and PATCH is not clobbered', async ({ page }) => {
  // NB: this test deliberately provokes a 422 (the ref race), which the browser
  // logs to the console as a failed network resource. That handled 422 is the
  // whole point, so we assert on committed STATE, not on a clean console here.
  const { mock } = await bootApp(page)

  // Arm a one-shot ref race: the app's FIRST PATCH will find that a concurrent
  // "processor" commit already landed a new item, and be rejected 422. The app
  // must refetch head, replay its waste delta onto the fresh content, and retry.
  await mock.armRaceAppendItem({
    id: 'i_remote_9999',
    receiptId: 'r_remote',
    rawName: 'REMOTE PROCESSOR ITEM',
    name: 'Remote item',
    groupId: null,
    category: 'misc',
    qty: 1,
    unit: 'ea',
    price: 2.0,
    status: 'active',
    flags: [],
  })

  await page.click('nav [data-tab="search"]')
  await page.fill('#sq', 'milk')
  await page.locator('#sresults .grp').first().click()
  await page.locator('#sresults [data-action="markWaste"]').first().click()
  await page.locator('.modal-card [data-mval="spoiled"]').click()
  await expect(page.locator('.toast')).toContainText('waste')

  const items = JSON.parse(mock.readFile('db/items.json'))
  // BOTH writers' changes survive: the remote item is present AND our waste landed.
  expect(items.some((i) => i.id === 'i_remote_9999')).toBe(true)
  expect(items.find((i) => i.id === 'i_milk_0001').status).toBe('thrown_away')
  const waste = JSON.parse(mock.readFile('db/waste.json'))
  expect(waste.some((w) => w.itemId === 'i_milk_0001')).toBe(true)
  // The retry means two commit attempts were created; the second fast-forwarded.
  expect(mock.commits.length).toBe(2)
  expect(mock.refUpdates).toBe(1)
})

test('a >1 MB items.json loads and renders (blobs API, ceiling gone)', async ({ page }) => {
  const { errors } = await bootApp(page, { mock: { oversizeItems: true } })
  await page.click('nav [data-tab="table"]')
  await expect(page.locator('#ttable')).toBeVisible()
  // 4 fixture items + 6000 filler rows are all present — a Contents GET would
  // have 403'd at 1 MB; the blob read did not.
  await expect(page.locator('#tcount')).toContainText('of 6004')
  expect(errors).toEqual([])
})

test('"reading…" self-resolves when the processor commits (freshness poll)', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  // Fixtures: r_pub_0002 is still unprocessed → Capture shows "1 still being read".
  await expect(page.locator('#main')).toContainText('1 still being read')

  // The processor commits: r_pub_0002 becomes processed.
  const receipts = JSON.parse(mock.readFile('db/receipts.json'))
  receipts.find((r) => r.id === 'r_pub_0002').status = 'processed'
  mock.injectRemote({ 'db/receipts.json': JSON.stringify(receipts, null, 2) })

  // Poll fires on visibilitychange; the app refetches only the changed path,
  // re-renders, and toasts — no manual reload.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('.toast')).toContainText('Synced — 1 receipt processed.')
  await expect(page.locator('#main')).toContainText('0 still being read')
  expect(errors).toEqual([])
})

test('boot persists a snapshot to IndexedDB for instant re-render', async ({ page }) => {
  await bootApp(page)
  // After the first load, the per-file snapshot + HEAD are cached in IndexedDB.
  const snap = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('gt_cache', 1)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const keys = await new Promise((res) => {
      const req = db.transaction('files', 'readonly').objectStore('files').getAllKeys()
      req.onsuccess = () => res(req.result)
    })
    return keys
  })
  expect(snap).toContain('__head__')
  expect(snap).toContain('file:db/items.json')
})
