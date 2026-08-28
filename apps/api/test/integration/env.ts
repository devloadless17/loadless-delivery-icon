/** Runs before any module loads in each test worker. */
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://loadless:loadless@localhost:5432/loadless_itest?schema=public';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_SECRET = 'integration-test-secret-at-least-32-chars-long';
process.env.APP_ORIGIN = 'http://localhost:3100';
process.env.NODE_ENV = 'test';
process.env.THROTTLE_LIMIT = '100000';
process.env.THROTTLE_DISABLE = '1';
process.env.STORAGE_DRIVER = 'local';
process.env.LOCAL_STORAGE_DIR = '/tmp/loadless-itest-uploads';
