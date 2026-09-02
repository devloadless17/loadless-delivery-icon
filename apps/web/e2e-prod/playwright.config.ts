import { defineConfig, devices } from '@playwright/test';

/**
 * Production verification — a SEPARATE config on purpose.
 *
 * The main suite must never be pointed at production: e2e/prepare.sh DROPS and
 * recreates its database, 02-admin mutates the real platform commission (the
 * number every future order's snapshot is computed from), and the deletion
 * specs remove vendors and drivers. None of that is survivable against live
 * data, and a planned wipe afterwards does not make it safe first — a wipe is a
 * decision, a destructive test run is an accident that resembles one.
 *
 * So this config has its own testDir, starts NO webServer, and drives the real
 * deployed site over HTTPS. It runs only when PROD_ADMIN_PASSWORD is set.
 */
const BASE = process.env.PROD_BASE_URL ?? 'https://flashdelivery.ink';

export default defineConfig({
  testDir: '.',
  // Long enough to absorb one 62s wait for the login throttle window to clear.
  timeout: 150_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: 'line',
  globalSetup: './global-setup.ts',
  use: { baseURL: BASE, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'prod-desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /06-mobile\.spec\.ts/,
    },
    {
      // The phone is where the driver's whole job happens, so his screens are
      // checked at real phone size with touch, not in a narrow desktop window.
      name: 'prod-mobile',
      use: { ...devices['Pixel 5'] },
      testMatch: /06-mobile\.spec\.ts/,
    },
  ],
});
