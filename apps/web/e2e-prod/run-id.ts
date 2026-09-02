import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const RUN_FILE = join(process.cwd(), 'test-results', '.prodcheck-run');

/** The run id every worker shares — written once by globalSetup. */
export function readRunId(): string {
  if (process.env.PRODCHECK_RUN) return process.env.PRODCHECK_RUN;
  try {
    return readFileSync(RUN_FILE, 'utf8').trim();
  } catch {
    throw new Error(
      'prod-check run id missing — globalSetup should have written test-results/.prodcheck-run',
    );
  }
}
