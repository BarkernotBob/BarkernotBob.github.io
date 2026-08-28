// Cross-app PWA install checks (GAP-W6).
//
// Unlike tests/grocery, this rig serves the repo's `quartz/` directory at the
// server root, so every app sits at /static/<app>/ exactly as it does on the
// live site. That matters: bank-bonus links its manifest and scopes its service
// worker with absolute /static/bank-bonus/ paths, which only resolve under that
// layout. Port 5174 keeps this rig runnable alongside tests/grocery (5173).
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
    baseURL: 'http://127.0.0.1:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'python3 -m http.server 5174 --bind 127.0.0.1 --directory ../../quartz',
    url: 'http://127.0.0.1:5174/static/grocery/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
