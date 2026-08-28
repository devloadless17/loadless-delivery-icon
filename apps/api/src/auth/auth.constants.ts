export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
/** Refresh cookie is scoped to the auth routes so it never travels elsewhere. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export const LOCKOUT_THRESHOLD = 5; // failures before lockout kicks in
export const LOCKOUT_BASE_MS = 60_000; // 1 min, doubling per extra failure
export const LOCKOUT_MAX_MS = 15 * 60_000; // capped at 15 min
