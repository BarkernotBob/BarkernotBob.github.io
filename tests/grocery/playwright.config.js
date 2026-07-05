// Playwright config for the Grocery Tracker regression rig (PRD §13, slice S0).
// Serves quartz/static over http so the app loads at the same relative path it
// ships at (/grocery/index.html) and service workers can register once S2 adds
// them. All api.github.com traffic is route-mocked (support/mock-github.js).
const { defineConfig, devices } = require('@playwright/test')

module.exports = defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, // one quarantine retry (§13)
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // CI runs `npx playwright install chromium` and uses the bundled build.
    // Local/managed envs can point at a pre-installed Chromium via PW_CHROMIUM_PATH
    // to skip the download (see repo env docs). Unset => Playwright's own browser.
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'python3 -m http.server 5173 --bind 127.0.0.1 --directory ../../quartz/static',
    url: 'http://127.0.0.1:5173/grocery/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
