// Playwright config for the Driveline (vehicle) rig (GAP-W2, issue #109).
//
// Serves the repo's `quartz/` directory at the server root so the app sits at
// /static/vehicle/ exactly as it does live. Port 5177 keeps it runnable
// alongside tests/grocery (5173), tests/install-checks (5174),
// tests/bank-bonus (5175) and tests/pool (5176).
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
    baseURL: 'http://127.0.0.1:5177',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // The app registers a service worker. Left alive it can serve a cached
    // shell into a later test and turn a real regression into a pass. The PWA
    // files are checked directly in boot.spec.js instead.
    serviceWorkers: 'block',
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'python3 -m http.server 5177 --bind 127.0.0.1 --directory ../../quartz',
    url: 'http://127.0.0.1:5177/static/vehicle/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
