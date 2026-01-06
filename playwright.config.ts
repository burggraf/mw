import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1, // Single worker for rate limit protection
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 120000, // 2 minutes per test
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    headless: process.env.CI ? true : false, // Visible browser locally, headless in CI
    video: 'on',
    screenshot: 'only-on-failure',
    // Grant clipboard permissions for copy/paste tests
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30000,
  },
  // Output directory for screenshots and traces
  outputDir: './e2e/test-results',
})
