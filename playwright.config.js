import { defineConfig, devices } from '@playwright/test'

const BASE_URL = 'http://127.0.0.1:8081'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', {
      open: 'never'
    }]
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome']
      }
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox']
      }
    }
  ],
  webServer: {
    command: 'npx http-server -c-1 -p 8081',
    // Readiness probe only: any 2xx/3xx response counts.
    url: `${BASE_URL}/tests/fixtures/`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe'
  }
})
