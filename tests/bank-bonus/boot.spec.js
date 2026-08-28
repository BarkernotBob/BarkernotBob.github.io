const { test, expect } = require('@playwright/test')
const { bootApp, goTab } = require('./support/boot')

// GAP-W2 class 1: the app boots with a clean console and every screen is
// reachable. Before this suite existed, bank-bonus shipped blind — nine PRs
// mostly re-covering the same ground.

const TABS = ['today', 'active', 'planned', 'offers', 'calendar', 'reports', 'settings']

test('boots with a clean console', async ({ page }) => {
  const { errors } = await bootApp(page)
  expect(errors, errors.join('\n')).toEqual([])
})

test('every tab opens, renders content, and leaves the console clean', async ({ page }) => {
  const { errors } = await bootApp(page)
  for (const tab of TABS) {
    await goTab(page, tab)
    const text = await page.locator(`#section-${tab}`).innerText()
    expect(text.trim().length, `${tab} rendered nothing`).toBeGreaterThan(20)
  }
  expect(errors, errors.join('\n')).toEqual([])
})

test('local mode never touches the network', async ({ page }) => {
  // The app promises "saved on this device only" until you connect GitHub.
  // Any api.github.com request before that is a broken promise, not a detail.
  const { githubCalls, errors } = await bootApp(page)
  for (const tab of TABS) await goTab(page, tab)
  expect(githubCalls, githubCalls.join('\n')).toEqual([])
  expect(errors, errors.join('\n')).toEqual([])
})

test('the fixture accounts are the ones on screen', async ({ page }) => {
  await bootApp(page)
  await goTab(page, 'active')
  const active = page.locator('#section-active')
  await expect(active).toContainText('Openbank One')
  await expect(active).toContainText('Second Savings')
  await expect(active).toContainText('Paid Out Bank')
  // Closed and planned accounts belong to their own views, not this one.
  await expect(active).not.toContainText('Closed Cooperative')
  await expect(active).not.toContainText('Planned Provident')
})

test('a reload keeps what is in the browser store', async ({ page }) => {
  await bootApp(page)
  await goTab(page, 'active')
  await page.reload()
  await page.locator('.nav-btn[data-tab="today"]').waitFor({ state: 'visible' })
  await goTab(page, 'active')
  await expect(page.locator('#section-active')).toContainText('Openbank One')
})
