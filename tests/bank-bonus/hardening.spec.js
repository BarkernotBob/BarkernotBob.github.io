const { test, expect } = require('@playwright/test')
const fs = require('fs')
const path = require('path')
const { bootSynced } = require('./support/boot')

const APP = path.join(__dirname, '..', '..', 'quartz', 'static', 'bank-bonus', 'index.html')

test('the app has no regex lookbehind, which older iPhones cannot parse', () => {
  // Safari before 16.4 rejects (?<= and (?<! as a syntax error, and the whole
  // script then fails to load: an empty app with no message.
  const src = fs.readFileSync(APP, 'utf8')
  expect(src).not.toMatch(/\(\?<[=!]/)
})

test('a synced repo with no config stops at Settings instead of opening empty', async ({ page }) => {
  // The repo answers 404 for the data files (the mock would otherwise fall back
  // to the fixtures). Routes added later take precedence over the mock's.
  await bootSynced(page, {
    prepare: () => page.route(/\/contents\/db\/[a-z]+\.json$/, (route) =>
      route.request().method() === 'GET' ? route.fulfill({ status: 404, json: { message: 'Not Found' } }) : route.fallback()),
  })
  await expect(page.locator('#section-settings')).toBeVisible()
  await expect(page.locator('#section-settings')).toContainText('No data found in testuser/bank-bonus-data: db/config.json is missing.')
})
