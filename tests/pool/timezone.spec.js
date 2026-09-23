const { test, expect } = require('@playwright/test')
const { bootApp, goTab } = require('./support/boot')

// Issue #136. The rest of the suite runs the browser in UTC, where "today" is
// the same date in every derivation, so an app that stamps dates in UTC passes
// by construction. Here the browser is in Fort Wayne and the clock is 9pm
// Eastern on 2026-07-15 — already 01:00 on 07-16 in UTC. Everything the app
// records or offers as "today" must still say 07-15.
test.use({ timezoneId: 'America/Indiana/Indianapolis' })

const LOCAL_DAY = '2026-07-15'
const EVENING = new Date('2026-07-15T21:00:00-04:00')

async function committed(mock, file) {
  return JSON.parse(mock.readFile(`db/${file}`))
}

test('a task marked done at 9pm Eastern records that day, not tomorrow', async ({ page }) => {
  const { mock, errors } = await bootApp(page, { now: EVENING })

  const item = page.locator('#main .item').filter({ hasText: 'Add chlorine' })
  await item.getByRole('button', { name: 'Done' }).click()
  await expect
    .poll(async () => (await committed(mock, 'config.json')).tasks.find((t) => t.id === 'chlorine').last)
    .toBe(LOCAL_DAY)

  // History shows the log entry under the local day too.
  await expect.poll(async () => (await committed(mock, 'log.json')).length).toBe(4)
  await goTab(page, 'history')
  await expect(page.locator('#main .item').filter({ hasText: 'Add chlorine' }).first()).toContainText(LOCAL_DAY)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a test logged at 9pm Eastern is dated that day', async ({ page }) => {
  const { mock, errors } = await bootApp(page, { now: EVENING })
  await goTab(page, 'test')
  await page.locator('.levels[data-key="fc"] button[data-l="normal"]').click()
  await page.click('#t_save')
  await expect.poll(async () => (await committed(mock, 'tests.json')).length).toBe(3)
  expect((await committed(mock, 'tests.json')).at(-1).date).toBe(LOCAL_DAY)
  expect(errors, errors.join('\n')).toEqual([])
})

test('the date pickers accept today, and default to it, at 9pm Eastern', async ({ page }) => {
  const { errors } = await bootApp(page, { now: EVENING })
  await page.getByRole('button', { name: /Log swim/i }).first().click()
  const d = page.locator('#sw_date')
  await expect(d).toHaveValue(LOCAL_DAY)
  await expect(d).toHaveAttribute('max', LOCAL_DAY)
  expect(errors, errors.join('\n')).toEqual([])
})
