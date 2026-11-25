const { test, expect } = require('@playwright/test')
const { bootSynced, goTab, fixture } = require('./support/boot')

// Issue #11: saves to the data repo must never fail silently, must not reuse a
// stale file version when two happen quickly, and on a real conflict must
// never re-send a stale list over someone else's newer change.

const OFFERS = 'db/offers.json'
const flagged = () => {
  const offers = JSON.parse(fixture('offers.json'))
  offers[0].needsVerification = true
  offers[1].needsVerification = true
  return offers
}
const remoteOffers = (mock) => JSON.parse(mock.readFile(OFFERS))
const strict = { strictContentsSha: true }
const prepare = (mock) => mock.injectRemote({ [OFFERS]: JSON.stringify(flagged(), null, 2) })

async function markVerified(page, institution) {
  const card = page.locator('#section-offers .card', { hasText: institution })
  await card.getByRole('button', { name: 'Mark verified' }).click()
  return card
}

test('two quick saves both land', async ({ page }) => {
  const { errors, mock } = await bootSynced(page, { mock: strict, prepare })
  await goTab(page, 'offers')
  const [a, b] = flagged()
  await markVerified(page, a.institution)
  await markVerified(page, b.institution)
  await expect
    .poll(() => remoteOffers(mock).filter((o) => o.needsVerification).length)
    .toBe(0)
  await expect(page.locator('.toast', { hasText: /couldn't|another device/i })).toHaveCount(0)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a change made elsewhere to another record is kept, not overwritten', async ({ page }) => {
  const { errors, mock } = await bootSynced(page, { mock: strict, prepare })
  await goTab(page, 'offers')
  const [a, b] = flagged()
  // Another device edits offer B after this page loaded.
  const other = flagged()
  other[1].notes = 'Edited on another device'
  mock.injectRemote({ [OFFERS]: JSON.stringify(other, null, 2) })

  await markVerified(page, a.institution)
  await expect.poll(() => remoteOffers(mock)[0].needsVerification).toBeUndefined()
  const remote = remoteOffers(mock)
  expect(remote[1].notes).toBe('Edited on another device')
  expect(remote[1].needsVerification).toBe(true)
  await expect(page.locator('#section-offers .card', { hasText: b.institution })).toContainText(
    'Edited on another device'
  )
  // The browser logs the expected 409 itself; nothing else may reach the console.
  const unexpected = errors.filter((e) => !/status of 409/.test(e))
  expect(unexpected, unexpected.join('\n')).toEqual([])
})

test('when both sides changed the same record, the other change wins and the user is told', async ({
  page,
}) => {
  const { mock } = await bootSynced(page, { mock: strict, prepare })
  await goTab(page, 'offers')
  const [a] = flagged()
  const other = flagged()
  other[0].notes = 'Changed elsewhere'
  mock.injectRemote({ [OFFERS]: JSON.stringify(other, null, 2) })

  await markVerified(page, a.institution)
  await expect(page.locator('.toast')).toContainText('changed on another device')
  const remote = remoteOffers(mock)
  expect(remote[0].notes).toBe('Changed elsewhere')
  expect(remote[0].needsVerification).toBe(true)
  // The screen shows what is saved: the flag is back.
  await expect(
    page.locator('#section-offers .card', { hasText: a.institution }).locator('.pill-verify')
  ).toBeVisible()
})

test('a failed save is reported and the screen goes back to the saved data', async ({ page }) => {
  const { mock } = await bootSynced(page, { mock: strict, prepare })
  await goTab(page, 'offers')
  const [a] = flagged()
  mock.armContentsPutFailure(500)
  await markVerified(page, a.institution)
  await expect(page.locator('.toast')).toContainText("Couldn't save")
  expect(remoteOffers(mock)[0].needsVerification).toBe(true)
  await expect(
    page.locator('#section-offers .card', { hasText: a.institution }).locator('.pill-verify')
  ).toBeVisible()
})

test('a change queued behind a failed save is not reported as saved', async ({ page }) => {
  const { mock } = await bootSynced(page, { mock: strict, prepare })
  await goTab(page, 'offers')
  const [a, b] = flagged()
  mock.armContentsPutFailure(500, 1500)
  await markVerified(page, a.institution)
  await markVerified(page, b.institution) // queued while the first save is still failing
  await expect(page.locator('.toast')).toContainText(/Not saved|Couldn't save/)
  await expect(page.locator('#section-offers .pill-verify')).toHaveCount(2)
  const remote = remoteOffers(mock)
  expect(remote[0].needsVerification).toBe(true)
  expect(remote[1].needsVerification).toBe(true)
})

test('a save whose reply was lost but which landed counts as saved', async ({ page }) => {
  const { mock } = await bootSynced(page, { mock: strict, prepare })
  await goTab(page, 'offers')
  const [a, b] = flagged()
  mock.armContentsPutLostResponse()
  await markVerified(page, a.institution)
  await expect.poll(() => remoteOffers(mock)[0].needsVerification).toBeUndefined()
  await expect(page.locator('.toast')).toContainText('marked verified')
  // The next save uses the right file version (no conflict, no merge commit).
  await markVerified(page, b.institution)
  await expect.poll(() => remoteOffers(mock)[1].needsVerification).toBeUndefined()
  await expect(page.locator('.toast')).not.toContainText(/couldn't|another device/i)
})
