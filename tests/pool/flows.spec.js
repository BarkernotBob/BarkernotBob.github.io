const { test, expect } = require('@playwright/test')
const { bootApp, goTab, TODAY } = require('./support/boot')

// One smoke test per main flow. Pool writes every change straight to GitHub, so
// "it worked" always means the file the app would have committed actually
// changed — asserted through mock.readFile(), not just what is on screen. A
// render that looks right over a save that silently threw is precisely the
// failure this app shipped for months (see editChecklist, in modals.spec.js).

// Poll the mock's committed text — what actually landed on main.
async function committed(mock, file) {
  return JSON.parse(mock.readFile(`db/${file}`))
}

test('marking a task done reschedules it and writes a log entry', async ({ page }) => {
  const { mock, errors } = await bootApp(page)

  // "Add chlorine" is the overdue one in the fixture.
  const item = page.locator('#main .item').filter({ hasText: 'Add chlorine' })
  await expect(item).toContainText('overdue 7d')
  await item.getByRole('button', { name: 'Done' }).click()

  await expect
    .poll(async () => (await committed(mock, 'config.json')).tasks.find((t) => t.id === 'chlorine').last)
    .toBe(TODAY)

  // Config and log land in one commit (#135), so the log is already there.
  await expect.poll(async () => (await committed(mock, 'log.json')).length).toBe(4)
  expect((await committed(mock, 'log.json')).at(-1)).toMatchObject({ kind: 'task', task: 'chlorine' })

  // And the screen agrees: one fewer due, badge down from 3 to 2. The row
  // stays put, ticked, rather than vanishing under your thumb (#144)...
  await expect(page.locator('#todayBadge')).toHaveText('2')
  const row = page.locator('#main .item').filter({ hasText: 'Add chlorine' })
  await expect(row).toHaveClass(/is-done/)
  await expect(row.getByRole('button', { name: '✓ Done' })).toBeDisabled()
  // ...and the list settles on the next visit to the tab.
  await goTab(page, 'test')
  await goTab(page, 'today')
  await expect(page.locator('#main .item').filter({ hasText: 'Add chlorine' })).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})

test('logging a strip test saves it and marks the test task done', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'test')

  await page.locator('.levels[data-key="fc"] button[data-l="low"]').click()
  await page.locator('.levels[data-key="ph"] button[data-l="normal"]').click()
  await page.fill('#t_notes', 'Green-ish after the storm')
  await page.click('#t_save')

  await expect.poll(async () => (await committed(mock, 'tests.json')).length).toBe(3)
  const saved = (await committed(mock, 'tests.json')).at(-1)
  expect(saved).toMatchObject({ date: TODAY, mode: 'qual', notes: 'Green-ish after the storm' })
  expect(saved.levels).toEqual({ fc: 'low', ph: 'normal' })

  // Saving a test also ticks the "test the water" chore off.
  await expect
    .poll(async () => (await committed(mock, 'config.json')).tasks.find((t) => t.id === 'test').last)
    .toBe(TODAY)

  // The advice modal is the point of the flow — it is what the button promises.
  await expect(page.locator('.modal-ov')).toContainText('what to do')
  expect(errors, errors.join('\n')).toEqual([])
})

// Issue #139 — tested at the pool, logged later.
test('a back-dated test keeps its date and never drags the test task backwards', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'test')

  const date = page.locator('#t_date')
  await expect(date).toHaveValue(TODAY)
  await expect(date).toHaveAttribute('max', TODAY)
  await expect(date).toHaveAttribute('type', 'date')

  // Fixture: the test task was last done 07-14, the newest test is 07-14.
  await date.fill('2026-07-10')
  // Switching Strips/Numbers re-renders the form; the date must survive it.
  await page.getByRole('button', { name: 'Numbers' }).click()
  await page.getByRole('button', { name: 'Strips' }).click()
  await expect(page.locator('#t_date')).toHaveValue('2026-07-10')

  await page.locator('.levels[data-key="fc"] button[data-l="normal"]').click()
  await page.click('#t_save')
  await expect.poll(async () => (await committed(mock, 'tests.json')).length).toBe(3)
  expect((await committed(mock, 'tests.json')).at(-1).date).toBe('2026-07-10')
  await expect(page.locator('.modal-ov')).toContainText('07/10/26')

  // 07-10 is older than 07-14, so the task keeps 07-14 rather than moving.
  await expect.poll(async () => (await committed(mock, 'config.json')).tasks.find((t) => t.id === 'test').last)
    .toBe('2026-07-14')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a back-dated test newer than the task moves the task to the test date, not today', async ({ page }) => {
  const { mock, errors } = await bootApp(page, {
    db: { 'config.json': (() => {
      const c = JSON.parse(require('./support/boot').fixture('config.json'))
      c.tasks.find((t) => t.id === 'test').last = '2026-07-01'
      return JSON.stringify(c)
    })() },
  })
  await goTab(page, 'test')
  await page.locator('#t_date').fill('2026-07-13')
  await page.locator('.levels[data-key="ph"] button[data-l="normal"]').click()
  await page.click('#t_save')
  await expect.poll(async () => (await committed(mock, 'config.json')).tasks.find((t) => t.id === 'test').last)
    .toBe('2026-07-13')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a back-dated test sorts by its date, not by when it was typed in', async ({ page }) => {
  const { mock } = await bootApp(page)
  await goTab(page, 'test')
  await page.locator('#t_date').fill('2026-07-10')
  await page.locator('.levels[data-key="fc"] button[data-l="high"]').click()
  await page.click('#t_save')
  await expect.poll(async () => (await committed(mock, 'tests.json')).length).toBe(3)
  await page.locator('.modal-ov').click({ position: { x: 5, y: 5 } })

  // Saved last, but older than the fixture's 07-14 test: Today's "Latest test"
  // is still 07-14, and History counts it among the free-chlorine readings.
  await goTab(page, 'today')
  await expect(page.locator('#main .card').filter({ hasText: 'Latest test' })).toContainText('07/14/26')
  await goTab(page, 'history')
  await expect(page.locator('#main .card').first()).toContainText('3 reading(s)')
})

test('a back-date is forgotten once you leave the form', async ({ page }) => {
  await bootApp(page)
  await goTab(page, 'test')
  await page.locator('#t_date').fill('2026-07-10')
  await page.getByRole('button', { name: 'Numbers' }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await goTab(page, 'test')
  await expect(page.locator('#t_date')).toHaveValue(TODAY)
})

test('a test dated in the future is refused', async ({ page }) => {
  const { mock } = await bootApp(page)
  await goTab(page, 'test')
  await page.locator('#t_date').evaluate((el) => { el.removeAttribute('max'); el.value = '2026-07-20' })
  await page.locator('.levels[data-key="fc"] button[data-l="normal"]').click()
  await page.click('#t_save')
  await expect(page.locator('#toast, .toast').first()).toContainText('future')
  expect(JSON.parse(mock.readFile('db/tests.json'))).toHaveLength(2)
})

test('a numeric test saves numbers, not levels', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'test')
  await page.getByRole('button', { name: 'Numbers' }).click()

  await page.locator('.num[data-key="fc"]').fill('2.2')
  await page.locator('.num[data-key="ph"]').fill('7.5')
  await page.click('#t_save')

  await expect.poll(async () => (await committed(mock, 'tests.json')).length).toBe(3)
  const saved = (await committed(mock, 'tests.json')).at(-1)
  expect(saved.mode).toBe('num')
  expect(saved.nums).toEqual({ fc: 2.2, ph: 7.5 })
  expect(saved.levels).toEqual({})
  expect(errors, errors.join('\n')).toEqual([])
})

test('a test with no readings picked is refused', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'test')
  await page.click('#t_save')

  await expect(page.locator('#toast')).toContainText('Pick at least one reading')
  // Nothing written — the guard has to actually stop the save, not just warn.
  expect((await committed(mock, 'tests.json')).length).toBe(2)
  expect(errors, errors.join('\n')).toEqual([])
})

test('logging swim time records the hours', async ({ page }) => {
  const { mock, errors } = await bootApp(page)

  await page.getByRole('button', { name: 'Log swim time' }).click()
  const dialog = page.locator('.modal-ov')
  await dialog.locator('#sw_hrs').fill('1.25')
  await dialog.getByRole('button', { name: 'Save' }).click()

  await expect.poll(async () => (await committed(mock, 'swim.json')).length).toBe(3)
  expect((await committed(mock, 'swim.json')).at(-1)).toMatchObject({ date: TODAY, hours: 1.25 })
  expect((await committed(mock, 'log.json')).at(-1)).toMatchObject({ kind: 'swim' })
  expect(errors, errors.join('\n')).toEqual([])
})

test('swim time rejects a blank or zero entry', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await page.getByRole('button', { name: 'Log swim time' }).click()
  await page.locator('.modal-ov').getByRole('button', { name: 'Save' }).click()

  await expect(page.locator('#toast')).toContainText('Enter the hours swum')
  expect((await committed(mock, 'swim.json')).length).toBe(2)
  expect(errors, errors.join('\n')).toEqual([])
})

test('editing a task changes its cadence and next due date', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'schedule')

  const row = page.locator('#main .item').filter({ hasText: 'Check & clean the basket' })
  await expect(row).toContainText('monthly')
  await row.getByRole('button', { name: 'Edit' }).click()

  const dialog = page.locator('.modal-ov')
  await dialog.getByRole('button', { name: 'Weekly', exact: true }).click()
  await dialog.getByRole('button', { name: 'Save' }).click()

  await expect
    .poll(async () => (await committed(mock, 'config.json')).tasks.find((t) => t.id === 'basket').cadence)
    .toBe('weekly')
  await expect(
    page.locator('#main .item').filter({ hasText: 'Check & clean the basket' })
  ).toContainText('weekly')
  expect(errors, errors.join('\n')).toEqual([])
})

test('the seasonal checklist can be marked done for the year', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'schedule')

  await page.getByRole('button', { name: /Mark opening done/i }).click()

  await expect.poll(async () => (await committed(mock, 'log.json')).length).toBe(4)
  expect((await committed(mock, 'log.json')).at(-1)).toMatchObject({ kind: 'season', task: 'opening' })
  expect(errors, errors.join('\n')).toEqual([])
})

test('pool settings save and show up on Today', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'settings')

  await page.fill('#s_name', 'Back Garden Pool')
  await page.fill('#s_gal', '15000')
  await page.fill('#s_loc', 'Peoria, IL')
  await page.getByRole('button', { name: 'Save pool' }).click()

  await expect.poll(async () => (await committed(mock, 'config.json')).pool.name).toBe('Back Garden Pool')
  const cfg = await committed(mock, 'config.json')
  expect(cfg.pool.gallons).toBe(15000)
  expect(cfg.pool.location).toBe('Peoria, IL')

  await goTab(page, 'today')
  await expect(page.locator('#main')).toContainText('Back Garden Pool')
  await expect(page.locator('#main')).toContainText('15,000 gal')
  expect(errors, errors.join('\n')).toEqual([])
})

test('the season window saves as month-day', async ({ page }) => {
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'settings')

  // The year in these date inputs is a placeholder the app deliberately drops —
  // the season repeats annually. This pins that it is stored as MM-DD.
  await page.fill('#s_open', '2024-05-01')
  await page.getByRole('button', { name: 'Save season' }).click()

  await expect.poll(async () => (await committed(mock, 'config.json')).season.open).toBe('05-01')
  expect(errors, errors.join('\n')).toEqual([])
})

test('history shows the logged tests, swims and activity', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'history')

  await expect(page.locator('#main')).toContainText('Test history')
  await expect(page.locator('#main')).toContainText('Free chlorine')
  // 2 + 1.5 from the swim fixture.
  await expect(page.locator('#main')).toContainText('3.5 h total')
  await expect(page.locator('#main')).toContainText('Check & clean the basket')
  expect(errors, errors.join('\n')).toEqual([])
})

// Issue #143 — the log stores the title at the time; History shows the current one.
test('recent activity shows a renamed task under its current title, and a deleted one under the old', async ({ page }) => {
  const { fixture } = require('./support/boot')
  const cfg = JSON.parse(fixture('config.json'))
  cfg.tasks.find((t) => t.id === 'basket').title = 'Empty the skimmer basket'
  const log = JSON.parse(fixture('log.json'))
  log.push({ id: 'l_gone', at: '2026-07-11T15:00:00.000Z', kind: 'task', task: 'retired', title: 'Brush the steps', by: 'testuser' })
  const { errors } = await bootApp(page, { db: { 'config.json': JSON.stringify(cfg), 'log.json': JSON.stringify(log) } })
  await goTab(page, 'history')

  const activity = page.locator('#main .card').filter({ hasText: 'Recent activity' })
  await expect(activity).toContainText('Empty the skimmer basket')
  await expect(activity).not.toContainText('Check & clean the basket')
  // No task with id "retired" exists any more: fall back to the stored title.
  await expect(activity).toContainText('Brush the steps')
  await expect(activity).toContainText('Swam 2 h')
  expect(errors, errors.join('\n')).toEqual([])
})

test('weather renders the mocked Open-Meteo data', async ({ page }) => {
  const { errors } = await bootApp(page)
  await goTab(page, 'weather')

  await expect(page.locator('#main')).toContainText('Weather')
  await expect(page.locator('#main')).toContainText('Springfield, IL')
  // The one wet day the fixture generates, three days before the pinned today.
  await expect(page.locator('#main')).toContainText('1.20"')
  expect(errors, errors.join('\n')).toEqual([])
})

test('a GitHub failure surfaces instead of failing silently', async ({ page }) => {
  // The app catches its own errors into a card. Left unasserted, a broken token
  // or a deleted repo looks identical to an empty pool — which is how "it just
  // stopped showing anything" becomes a whole debugging session.
  const { errors } = await bootApp(page)

  await page.route('**://api.github.com/**', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Bad credentials"}' })
  )
  await page.reload()

  await expect(page.locator('#main')).toContainText('Something went wrong')
  await expect(page.locator('#main')).toContainText('401')
  await expect(page.locator('#main')).toContainText('Open Settings')
  // Chromium logs its own "Failed to load resource … 401" line for the rejected
  // fetch; that is the browser, not the app. What matters is that the app threw
  // nothing of its own on top of it.
  const appErrors = errors.filter((e) => !/Failed to load resource/.test(e))
  expect(appErrors, appErrors.join('\n')).toEqual([])
})

test('a partial load failure surfaces too, rather than half-rendering', async ({ page }) => {
  // The nastier shape of the same failure: loadAll() reads the four files in
  // turn, so a 403 on the third leaves D.config set but D.log missing. A boot
  // that shrugs that off renders a normal-looking Today over half a dataset,
  // and the next "Done" tap throws somewhere nothing catches it and silently
  // does nothing — the worst version, because it looks like it worked.
  const { mock, errors } = await bootApp(page)

  await page.route(`**/git/blobs/${mock.blobSha('db/log.json')}`, (route, req) => {
    if (req.method() === 'GET')
      return route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"Forbidden"}' })
    return route.fallback()
  })
  await page.reload()

  await expect(page.locator('#main')).toContainText('Something went wrong')
  await expect(page.locator('#main')).not.toContainText('Due now')
  const appErrors = errors.filter((e) => !/Failed to load resource/.test(e))
  expect(appErrors, appErrors.join('\n')).toEqual([])
})

// ---------------------------------------------------------------------------
// Issue #134 — one tap writes one record. 11 of 33 entries in the real
// log.json were duplicates: a failed save kept its record and a second tap
// wrote a new copy, and two taps inside one round trip queued two commits.
// ---------------------------------------------------------------------------

// Fail the next PATCH of main's ref with `status`, once; everything else
// (and every later PATCH) goes on to the mock.
async function failNextRefUpdate(page, status) {
  let failed = false
  await page.route('**/git/refs/heads/main', (route) => {
    if (route.request().method() === 'PATCH' && !failed) {
      failed = true
      return route.fulfill({ status, contentType: 'application/json', body: '{"message":"boom"}' })
    }
    return route.fallback()
  })
}

// Hold every PATCH of main's ref for `ms` — a realistic phone round trip.
async function slowRefUpdates(page, ms) {
  await page.route('**/git/refs/heads/main', async (route) => {
    if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, ms))
    return route.fallback()
  })
}

test('a failed save, tapped again, writes one test record — not two', async ({ page }) => {
  const { mock } = await bootApp(page)
  await failNextRefUpdate(page, 500)
  await goTab(page, 'test')
  await page.locator('.levels[data-key="fc"] button[data-l="low"]').click()

  await page.click('#t_save')
  await expect(page.locator('#toast')).toContainText('500')
  expect((await committed(mock, 'tests.json')).length).toBe(2)
  // The failed save left the button usable, and the app as it was.
  await expect(page.locator('#t_save')).toBeEnabled()

  await page.click('#t_save')
  await expect.poll(async () => (await committed(mock, 'tests.json')).length).toBe(3)
  await expect(page.locator('.modal-ov')).toContainText('what to do')
  expect((await committed(mock, 'tests.json')).at(-1).levels).toEqual({ fc: 'low' })
})

test('a save that landed but lost its reply writes one record when retried', async ({ page }) => {
  // The phone case: the commit reached GitHub, the answer never came back, the
  // app said "failed". Tapping Done again must not log the task a second time.
  const { mock, errors } = await bootApp(page)
  mock.armLostResponse()
  const item = page.locator('#main .item').filter({ hasText: 'Add chlorine' })

  await item.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('#toast')).toContainText('502')
  const afterFirst = await committed(mock, 'log.json')
  expect(afterFirst).toHaveLength(4) // it did land

  await item.getByRole('button', { name: 'Done' }).click()
  await expect(page.locator('#toast')).toContainText('Logged')
  const final = await committed(mock, 'log.json')
  expect(final).toHaveLength(4)
  expect(final.filter((e) => e.task === 'chlorine')).toHaveLength(1)
  const appErrors = errors.filter((e) => !/Failed to load resource/.test(e))
  expect(appErrors, appErrors.join('\n')).toEqual([])
})

test('two taps on Mark done inside one round trip write one record', async ({ page }) => {
  const { mock } = await bootApp(page)
  await slowRefUpdates(page, 1500)
  await goTab(page, 'schedule')
  const sel = '#main [data-action="markTask"][data-a1="chlorine"]'
  const btn = page.locator(sel)

  await page.evaluate((s) => document.querySelector(s).click(), sel)
  // While it works, the button says so and can't be tapped.
  await expect(btn).toHaveClass(/busy/)
  await expect(btn).toBeDisabled()
  // A second tap still inside the round trip — dispatched even after
  // re-enabling the button by hand, so this proves the in-flight guard itself,
  // not just the disabled attribute (a save can re-render the tab under a
  // second tap, putting a fresh, enabled button there).
  await page.evaluate((s) => {
    const b = document.querySelector(s)
    b.disabled = false
    b.click()
  }, sel)

  await expect(page.locator('#toast')).toContainText('Logged')
  await expect(page.locator('#main .busy')).toHaveCount(0)
  const log = await committed(mock, 'log.json')
  expect(log.filter((e) => e.task === 'chlorine')).toHaveLength(1)
  expect(mock.refUpdates).toBe(1)
})

test("Today's Done shows it is working without moving anything, and double-taps write once", async ({ page }) => {
  const { mock } = await bootApp(page)
  await slowRefUpdates(page, 700)
  const btn = page.locator('#main [data-action="markTask"][data-a1="chlorine"]')
  const card = page.locator('#main .card:has([data-action="markTask"][data-a1="chlorine"])')
  const before = { btn: await btn.boundingBox(), card: await card.boundingBox() }

  await page.evaluate(() => {
    const b = document.querySelector('#main [data-action="markTask"][data-a1="chlorine"]')
    b.click()
    b.click()
  })
  await expect(btn).toHaveClass(/busy/)
  await expect(btn).toBeDisabled()
  expect(await btn.boundingBox()).toEqual(before.btn)
  expect(await card.boundingBox()).toEqual(before.card)

  await expect(btn).toHaveText('✓ Done')
  await expect(btn).not.toHaveClass(/busy/)
  await expect(btn).toBeDisabled() // settled rows stay done (#144)
  expect(await btn.boundingBox()).toEqual(before.btn)
  const log = await committed(mock, 'log.json')
  expect(log.filter((e) => e.task === 'chlorine')).toHaveLength(1)
})

test('marking a task already logged today asks first', async ({ page }) => {
  // Fixture: the robot was already run today (last = 2026-07-15).
  const { mock, errors } = await bootApp(page)
  await goTab(page, 'schedule')
  const markRobot = page.locator('#main [data-action="markTask"][data-a1="robot"]')

  await markRobot.click()
  const dialog = page.locator('.modal-ov')
  await expect(dialog).toContainText('already logged today')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('#main .busy')).toHaveCount(0)
  expect(await committed(mock, 'log.json')).toHaveLength(3)

  await markRobot.click()
  await page.locator('.modal-ov').getByRole('button', { name: 'Log again' }).click()
  await expect.poll(async () => (await committed(mock, 'log.json')).length).toBe(4)
  expect((await committed(mock, 'log.json')).at(-1)).toMatchObject({ task: 'robot' })

  // A task done for the first time today doesn't ask...
  await page.locator('#main [data-action="markTask"][data-a1="chlorine"]').click()
  await expect.poll(async () => (await committed(mock, 'log.json')).length).toBe(5)
  // ...but tapping it again does.
  await page.locator('#main [data-action="markTask"][data-a1="chlorine"]').click()
  await expect(page.locator('.modal-ov')).toContainText('already logged today')
  expect(errors, errors.join('\n')).toEqual([])
})

test('marking a seasonal checklist done twice in one day asks first', async ({ page }) => {
  const { mock } = await bootApp(page)
  await goTab(page, 'schedule')
  const mark = page.getByRole('button', { name: /Mark opening done/i })

  await mark.click()
  await expect.poll(async () => (await committed(mock, 'log.json')).length).toBe(4)
  await mark.click()
  const dialog = page.locator('.modal-ov')
  await expect(dialog).toContainText('already logged today')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  expect(await committed(mock, 'log.json')).toHaveLength(4)
})

test('the same swim logged again minutes after a lost reply is a second record, not a dropped resend', async ({ page }) => {
  // A kept record is only for an immediate retry. Later, the same date and
  // hours are a real second swim and must be written.
  const { mock } = await bootApp(page)
  mock.armLostResponse()
  const logSwim = async () => {
    await page.getByRole('button', { name: 'Log swim time' }).click()
    await page.locator('.modal-ov #sw_hrs').fill('1')
    await page.locator('.modal-ov').getByRole('button', { name: 'Save' }).click()
  }
  await logSwim()
  await expect(page.locator('#toast')).toContainText('502')
  expect(await committed(mock, 'swim.json')).toHaveLength(3) // it landed

  // Nobody retries. A later swim with the same date and hours is real.
  await page.clock.setFixedTime(new Date(`${TODAY}T12:05:00Z`)) // same day, 5 min on
  await logSwim() // same swim, five minutes later: a new record
  await expect.poll(async () => (await committed(mock, 'swim.json')).length).toBe(4)
})
