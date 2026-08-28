import { Injectable } from '@nestjs/common';
import { parseEnv, type Env } from './env';

/**
 * Typed access to validated environment configuration.
 * The only place in the codebase allowed to read process.env.
 */
@Injectable()
export class AppConfigService {
  readonly env: Env;

  constructor() {
    this.env = parseEnv(process.env);
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }
}
