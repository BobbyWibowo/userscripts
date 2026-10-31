import { defineConfig, devices } from '@playwright/test'

const BASE_URL = 'http://127.0.0.1:8080'

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
    command: 'npm run serve',
    url: `${BASE_URL}/tests/fixtures/dragon-tea-decipher.html`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe'
  }
})
