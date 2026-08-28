import { defineConfig, devices } from '@playwright/test';

/**
 * Golden-path e2e against the real stack: production web build + API + Postgres
 * + Redis. Run `pnpm e2e:prepare` first (migrates + seeds the e2e database and
 * builds both apps); `pnpm e2e` boots everything and runs the flow.
 */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://loadless:loadless@localhost:5432/loadless_e2e?schema=public';

const apiEnv = {
  NODE_ENV: 'test',
  PORT: '4190',
  DATABASE_URL: E2E_DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  JWT_SECRET: 'e2e-test-secret-at-least-32-characters-long',
  APP_ORIGIN: 'http://localhost:3190',
  STORAGE_DRIVER: 'local',
  LOCAL_STORAGE_DIR: '/tmp/loadless-e2e-uploads',
  THROTTLE_LIMIT: '100000',
  SOCKET_REDIS_ADAPTER: 'false',
  TRUSTED_PROXY_HOPS: '0',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1, // the flow is stateful across roles — keep it serial
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:3190',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: 'http://localhost:4190/api/v1/health',
      reuseExistingServer: false,
      timeout: 30_000,
      env: apiEnv,
    },
    {
      command: 'pnpm exec next start -p 3190',
      url: 'http://localhost:3190/login',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_ORIGIN: 'http://localhost:4190', PORT: '3190' },
    },
  ],
});
