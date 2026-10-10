// The group math in logic.js, run inside the page so it's the exact shipped module.
const { test, expect } = require('@playwright/test')

test.beforeEach(async ({ page }) => {
  await page.goto('/static/bookclub/logic.js')
})

const run = (page, fn, arg) =>
  page.evaluate(async ([src, a]) => {
    const L = await import('/static/bookclub/logic.js')
    return new Function('L', 'a', `return (${src})(L, a)`)(L, a)
  }, [fn.toString(), arg])

test('best block keeps going while the same people stay free', async ({ page }) => {
  const members = [
    { name: 'A', slots: ['1-18', '1-19', '1-20'] },
    { name: 'B', slots: ['1-19', '1-20'] },
  ]
  const blocks = await run(page, (L, m) => L.bestBlocks(m), members)
  expect(blocks[0]).toMatchObject({ day: 1, start: 19, end: 21, people: ['A', 'B'] })
  // A alone from 6 PM overlaps the top block, so it isn't offered as a separate option.
  expect(blocks.some((b) => b.day === 1 && b.start === 18 && b.end === 21)).toBe(false)
})

test('a block running to the last hour on the calendar is still counted', async ({ page }) => {
  const blocks = await run(page, (L, m) => L.bestBlocks(m), [{ name: 'A', slots: ['6-21', '6-22'] }])
  expect(blocks[0]).toMatchObject({ day: 6, start: 21, end: 23 })
})

test('meeting rhythm: the group can meet as often as its least frequent member', async ({ page }) => {
  const s = await run(page, (L, m) => L.cadenceSummary(m), [
    { name: 'A', cadence: 2 },
    { name: 'B', cadence: 3 },
    { name: 'C' },
  ])
  expect(s.answered).toBe(2)
  expect(s.everyone).toBe(3)
  expect(s.rows.find((r) => r.weeks === 2).can).toEqual(['A'])
  expect(s.rows.find((r) => r.weeks === 3).can).toEqual(['A', 'B'])
})

test('next meeting dates step by the rhythm from the next matching weekday', async ({ page }) => {
  const dates = await run(page, (L) =>
    L.nextDates(1, 3, { from: new Date(2026, 9, 10), count: 3 }).map((d) => d.toDateString()),
  )
  // Sat Oct 10 2026 → next Tuesday is Oct 13, then every 3 weeks.
  expect(dates).toEqual(['Tue Oct 13 2026', 'Tue Nov 03 2026', 'Tue Nov 24 2026'])
})
