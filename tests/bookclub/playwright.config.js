// Playwright config for the book club scheduler (quartz/static/bookclub/).
//
// Serves (support/serve.js) the repo's `quartz/` directory at the server root so the page sits at
// /static/bookclub/ exactly as it does live. Port 5178 keeps it runnable
// alongside the other suites (5173–5177). The Cloudflare API is mocked in
// support/mock-api.js, so no network or worker is needed.
const { defineConfig, devices } = require('@playwright/test')

module.exports = defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:5178',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // A live service worker could serve a cached page into a later test; the
    // PWA side is checked by tests/install-checks instead.
    serviceWorkers: 'block',
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 1000 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node support/serve.js 5178',
    url: 'http://127.0.0.1:5178/static/bookclub/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
