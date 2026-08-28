// Playwright config for the Bank Bonus Tracker rig (GAP-W2).
//
// Serves the repo's `quartz/` directory at the server root so the app sits at
// /static/bank-bonus/ exactly as it does live — this app links its manifest and
// scopes its service worker with absolute /static/bank-bonus/ paths, which
// resolve no other way. Port 5175 keeps it runnable alongside tests/grocery
// (5173) and tests/install-checks (5174).
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
    baseURL: 'http://127.0.0.1:5175',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'python3 -m http.server 5175 --bind 127.0.0.1 --directory ../../quartz',
    url: 'http://127.0.0.1:5175/static/bank-bonus/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
