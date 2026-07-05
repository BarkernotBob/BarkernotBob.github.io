// Shared test bootstrap: seed localStorage so isConfigured() is true (skips the
// setup screen), install the GitHub mock, then navigate. Collects console errors
// and page errors so every test can assert a clean console (§13 class 1).
const { installGitHubMock } = require('./mock-github')

const APP_URL = '/grocery/index.html'

// Viewports we screenshot every view at (§13 class 1). Dark theme lands with the
// design system (S3); this rig is the hook it plugs into.
const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  compact: { width: 1024, height: 768 },
  desktop: { width: 1400, height: 900 },
}

async function bootApp(page, { viewport = VIEWPORTS.mobile } = {}) {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.setViewportSize(viewport)

  // Seed a configured session BEFORE any app script runs.
  await page.addInitScript(() => {
    localStorage.setItem('gt_repo', 'testuser/grocery-data')
    localStorage.setItem('gt_token', 'ghp_test_token')
    localStorage.setItem('gt_me', 'Me')
    localStorage.setItem('gt_device', 'Test Phone')
    localStorage.setItem('gt_method', 'token')
  })

  const mock = await installGitHubMock(page)
  await page.goto(APP_URL)
  // Boot lands on Capture and runs loadAll(); wait for that first render to
  // settle before navigating, so a test's nav click doesn't race the boot's
  // in-flight show('capture') (both would call loadAll and the loser's render
  // would clobber the winner's). Proper load coordination arrives with S1.
  await page.getByText('Snap a receipt').waitFor({ state: 'visible' })
  return { errors, mock, VIEWPORTS }
}

module.exports = { bootApp, APP_URL, VIEWPORTS }
