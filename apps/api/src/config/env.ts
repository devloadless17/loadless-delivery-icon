import { z } from 'zod';

/**
 * Environment contract. The process refuses to boot on invalid config —
 * a missing secret must fail loudly at startup, never at first use.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4100),

  DATABASE_URL: z.string().url().or(z.string().startsWith('postgresql://')),
  REDIS_URL: z.string().startsWith('redis://').or(z.string().startsWith('rediss://')),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  APP_ORIGIN: z
    .string()
    .url()
    .refine((v) => !v.endsWith('/'), 'APP_ORIGIN must not end with a trailing slash'),

  SOCKET_REDIS_ADAPTER: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('./uploads'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),

  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    console.error(`Invalid environment configuration:\n${lines.join('\n')}`);
    process.exit(1);
  }
  const env = result.data;
  if (env.STORAGE_DRIVER === 'r2') {
    const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].filter(
      (k) => !source[k],
    );
    if (missing.length > 0) {
      console.error(`STORAGE_DRIVER=r2 requires: ${missing.join(', ')}`);
      process.exit(1);
    }
  }
  return env;
}
