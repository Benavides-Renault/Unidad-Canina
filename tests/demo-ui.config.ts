import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './demo',
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  expect: { timeout: 15000 },
  outputDir: '../.local/demo-ui-results',
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    ...devices['Desktop Chrome'],
    timezoneId: 'America/Costa_Rica',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
