const { test, expect } = require('@playwright/test')
const { bootApp, goTab, fixture } = require('./support/boot')

// Issue #138 — deleting a mis-logged entry. Before this, nothing in the app
// could remove a log entry, a test or a swim, and 11 of 33 real log entries
// were duplicates left by #134. Every delete here is asserted against what
// actually landed on main (mock.readFile), and is ONE commit however many
// files it touches.

const read = (mock, file) => JSON.parse(mock.readFile(`db/${file}`))
const taskLast = (mock, id) => read(mock, 'config.json').tasks.find((t) => t.id === id).last

function recordTrees(page) {
  const trees = []
  page.on('request', (req) => {
    if (req.method() === 'POST' && /\/git\/trees$/.test(req.url()))
      trees.push(JSON.parse(req.postData()).tree.map((e) => e.path).sort())
  })
  return trees
}

const activity = (page) => page.locator('#main .card').filter({ hasText: 'Recent activity' })
const loggedTests = (page) => page.locator('#main .card').filter({ hasText: 'Logged tests' })

async function confirmDelete(page) {
  const dialog = page.locator('.modal-ov')
  await expect(dialog).toContainText('can’t be undone')
  await dialog.getByRole('button', { name: 'Delete' }).click()
}

test('an activity entry is deleted only after the confirm, in one commit', async ({ page }) => {
  const trees = recordTrees(page)
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'history')
  const row = activity(page).locator('.item').filter({ hasText: 'Check & clean the basket' })

  // Cancel changes nothing.
  await row.getByRole('button', { name: /Delete/ }).click()
  await page.locator('.modal-ov').getByRole('button', { name: 'Cancel' }).click()
  expect(read(mock, 'log.json')).toHaveLength(3)
  expect(mock.commits).toHaveLength(0)

  await row.getByRole('button', { name: /Delete/ }).click()
  await confirmDelete(page)
  await expect.poll(async () => read(mock, 'log.json').map((e) => e.id)).toEqual(['l_fixture_1', 'l_fixture_3'])
  expect(mock.commits).toHaveLength(1)
  // The basket's `last` (07-10) rested on that entry alone, so it is cleared
  // rather than left claiming a day nothing supports — in the same commit.
  expect(taskLast(mock, 'basket')).toBe(null)
  expect(trees).toEqual([['db/config.json', 'db/log.json']])

  await expect(row).toHaveClass(/is-deleted/)
  await expect(row.getByRole('button', { name: /Delete/ })).toHaveText('Deleted')
  await expect(row.getByRole('button', { name: /Delete/ })).toBeDisabled()
  // And the list settles on the next visit.
  await goTab(page, 'today')
  await goTab(page, 'history')
  await expect(activity(page)).not.toContainText('Check & clean the basket')
  expect(errors, errors.join('\n')).toEqual([])
})

test('deleting one of a duplicate pair keeps the task date and the other copy', async ({ page }) => {
  const log = JSON.parse(fixture('log.json'))
  log.push(
    { id: 'l_dup_a', at: '2026-07-14T12:00:00.100Z', kind: 'task', task: 'pump', title: 'Run the pump', by: 'testuser' },
    { id: 'l_dup_b', at: '2026-07-14T12:00:00.900Z', kind: 'task', task: 'pump', title: 'Run the pump', by: 'testuser' }
  )
  const { mock } = await bootApp(page, { db: { 'log.json': JSON.stringify(log) } })
  await goTab(page, 'history')

  await activity(page).getByRole('button', { name: 'Delete Run the pump from 2026-07-14' }).first().click()
  await confirmDelete(page)
  await expect.poll(async () => read(mock, 'log.json').map((e) => e.id)).not.toContain('l_dup_b')
  expect(read(mock, 'log.json').map((e) => e.id)).toContain('l_dup_a')
  expect(taskLast(mock, 'pump')).toBe('2026-07-14')
})

test('a deleted row stays where it is — nothing below it moves', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'history')
  const rows = activity(page).locator('.item')
  // Page coordinates, not viewport ones: the click may scroll the row into view.
  const where = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height } })
  const watched = [rows.nth(0), rows.nth(1), loggedTests(page)]
  const before = await Promise.all(watched.map(where))

  await rows.nth(0).getByRole('button', { name: /Delete/ }).click()
  await confirmDelete(page)
  await expect(rows.nth(0)).toHaveClass(/is-deleted/)
  expect(await Promise.all(watched.map(where))).toEqual(before)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a logged test can be deleted, and the test task walks back to the newest one left', async ({ page }) => {
  const trees = recordTrees(page)
  const { mock, errors } = await bootApp(page)
  expect(taskLast(mock, 'test')).toBe('2026-07-14')
  await goTab(page, 'history')

  const card = loggedTests(page)
  // Newest first.
  await expect(card.locator('.item').first()).toContainText('07/14/26')
  await expect(card.locator('.item').first()).toContainText('Numbers · FC 0.6')
  await card.getByRole('button', { name: 'Delete the test from 2026-07-14' }).click()
  await confirmDelete(page)

  await expect.poll(async () => read(mock, 'tests.json').map((t) => t.id)).toEqual(['t_fixture_1'])
  // 07-14 no longer exists; 07-08 (the remaining test and its log entry) does.
  expect(taskLast(mock, 'test')).toBe('2026-07-08')
  expect(mock.commits).toHaveLength(1)
  expect(trees).toEqual([['db/config.json', 'db/tests.json']])
  expect(errors, errors.join('\n')).toEqual([])
})

test('deleting the last test and the last test log entry clears the test date', async ({ page }) => {
  const tests = JSON.parse(fixture('tests.json')).filter((t) => t.id === 't_fixture_2')
  const log = JSON.parse(fixture('log.json')).filter((e) => e.task !== 'test')
  const { mock } = await bootApp(page, { db: { 'tests.json': JSON.stringify(tests), 'log.json': JSON.stringify(log) } })
  await goTab(page, 'history')
  await loggedTests(page).getByRole('button', { name: /Delete/ }).click()
  await confirmDelete(page)
  await expect.poll(async () => read(mock, 'tests.json')).toEqual([])
  expect(taskLast(mock, 'test')).toBe(null)
})

test('a swim entry can be deleted, taking its hours with it', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'history')
  await expect(page.locator('#main')).toContainText('3.5 h total')

  // A fixture row from before swimId existed: matched by hours and moment.
  await activity(page).getByRole('button', { name: 'Delete Swam 2 h from 2026-07-12' }).click()
  const dialog = page.locator('.modal-ov')
  await expect(dialog).toContainText('swim hours are removed too')
  await confirmDelete(page)

  await expect.poll(async () => read(mock, 'swim.json').map((s) => s.id)).toEqual(['sw_fixture_2'])
  expect(read(mock, 'log.json').some((e) => e.kind === 'swim')).toBe(false)
  expect(mock.commits).toHaveLength(1)
  await goTab(page, 'today')
  await goTab(page, 'history')
  await expect(page.locator('#main')).toContainText('1.5 h total')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a swim logged today links to its record and deletes cleanly', async ({ page }) => {
  const { mock } = await bootApp(page)
  await page.getByRole('button', { name: 'Log swim time' }).click()
  await page.locator('#sw_hrs').fill('2')
  await page.locator('.modal-ov').getByRole('button', { name: 'Save' }).click()
  await expect.poll(async () => read(mock, 'swim.json').length).toBe(3)
  const mine = read(mock, 'swim.json').at(-1)
  // Same hours as the 07-12 fixture swim: only the id link keeps them apart.
  expect(read(mock, 'log.json').at(-1).swimId).toBe(mine.id)

  await goTab(page, 'history')
  await activity(page).getByRole('button', { name: /Delete Swam 2 h from 2026-07-15/ }).click()
  await confirmDelete(page)
  await expect.poll(async () => read(mock, 'swim.json').map((s) => s.id)).toEqual(['sw_fixture_1', 'sw_fixture_2'])
})

test("a delete racing another device's save keeps the other device's entry", async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  const other = { id: 'l_other_device', at: '2026-07-15T11:00:00.000Z', kind: 'task', task: 'robot', title: 'Robot vacuum', by: 'otherdevice' }
  mock.armRaceInject({ 'db/log.json': JSON.stringify([...read(mock, 'log.json'), other], null, 2) })
  await goTab(page, 'history')
  await activity(page).getByRole('button', { name: /Delete Check & clean the basket/ }).click()
  await confirmDelete(page)

  await expect.poll(async () => read(mock, 'log.json').map((e) => e.id)).toEqual(['l_fixture_1', 'l_fixture_3', 'l_other_device'])
  expect(mock.refUpdates).toBe(1)
  const appErrors = errors.filter((e) => !/Failed to load resource/.test(e))
  expect(appErrors, appErrors.join('\n')).toEqual([])
})

test("another device's swim, seen only through the log, still takes its hours when deleted", async ({ page }) => {
  // This device's swim.json copy is older than its log: a save refreshes only
  // the files it wrote. The match must run on the fresh swim.json in the commit.
  const { mock } = await bootApp(page)
  const swim = { id: 'sw_other', date: '2026-07-15', hours: 3, at: '2026-07-15T11:00:00.000Z', by: 'otherdevice' }
  const entry = { id: 'l_other', at: '2026-07-15T11:00:00.004Z', kind: 'swim', swimId: 'sw_other', title: 'Swam 3 h', by: 'otherdevice' }
  mock.injectRemote({
    'db/swim.json': JSON.stringify([...read(mock, 'swim.json'), swim], null, 2),
    'db/log.json': JSON.stringify([...read(mock, 'log.json'), entry], null, 2),
  })
  // Marking a task done commits log.json, so this device now sees the swim row.
  await page.locator('#main .item').filter({ hasText: 'Add chlorine' }).getByRole('button', { name: 'Done' }).click()
  await expect.poll(async () => taskLast(mock, 'chlorine')).toBe('2026-07-15')

  await goTab(page, 'history')
  await activity(page).getByRole('button', { name: 'Delete Swam 3 h from 2026-07-15' }).click()
  await confirmDelete(page)
  await expect.poll(async () => read(mock, 'swim.json').map((s) => s.id)).toEqual(['sw_fixture_1', 'sw_fixture_2'])
  expect(read(mock, 'log.json').map((e) => e.id)).not.toContain('l_other')
})
