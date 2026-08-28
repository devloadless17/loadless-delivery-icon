import { execSync } from 'node:child_process';

/**
 * Prepares the integration database: creates it if possible (local dev docker;
 * harmless failure in CI where the service container pre-creates it) and
 * applies migrations.
 */
export default function globalSetup(): void {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://loadless:loadless@localhost:5432/loadless_itest?schema=public';

  const dbName = new URL(url).pathname.replace('/', '');
  try {
    execSync(`docker exec loadless-postgres createdb -U loadless ${dbName}`, { stdio: 'ignore' });
  } catch {
    // already exists, or not local docker (CI) — fine either way
  }

  execSync('npx prisma migrate deploy', {
    cwd: `${__dirname}/../..`,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });
}
