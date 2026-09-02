import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { RUN_FILE } from './run-id';

/**
 * Fix one identity prefix for the whole run, on disk.
 *
 * It used to be `Date.now()` at module load, which is per PROCESS — and
 * Playwright restarts its worker after a failure. So a failure minted a new
 * prefix, and every spec after it tried to sign in as accounts that had never
 * been created, failing as a login timeout that pointed nowhere near the cause.
 * A file is the only thing every worker agrees on.
 */
export default function globalSetup() {
  const run = process.env.PRODCHECK_RUN ?? String(Date.now()).slice(-8);
  mkdirSync(dirname(RUN_FILE), { recursive: true });
  writeFileSync(RUN_FILE, run, 'utf8');
  process.env.PRODCHECK_RUN = run;
  // eslint-disable-next-line no-console
  console.log(`[prod-check] run id ${run} — everything created is stamped PRODCHECK-${run}`);
}
