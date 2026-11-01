import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    env: {
      TZ: 'UTC'
    },
    include: [
      'tests/unit/**/*.test.js'
    ],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: [
        'text',
        'html'
      ],
      exclude: [
        'tests/**'
      ]
    }
  }
})
