import { defineConfig, devices } from '@playwright/test';

/** Screenshot sweep against the running DEV server — no build, no downtime. */
export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  workers: 1,
  reporter: 'line',
  use: { baseURL: 'http://localhost:3100' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
