export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes (silently refreshed)

/**
 * Sessions are permanent by product decision: one login per device, never
 * expired automatically. 400 days is the browser cookie ceiling (Chrome), and
 * every refresh re-issues cookies + DB expiry, sliding the window forward —
 * any activity within 400 days keeps the session alive indefinitely. Sessions
 * end ONLY on explicit sign-out, admin suspension/password change, or
 * refresh-token theft detection.
 */
export const REFRESH_TOKEN_TTL_SECONDS = 400 * 24 * 60 * 60; // 400 days, sliding

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
/** Refresh cookie is scoped to the auth routes so it never travels elsewhere. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export const LOCKOUT_THRESHOLD = 5; // failures before lockout kicks in
export const LOCKOUT_BASE_MS = 60_000; // 1 min, doubling per extra failure
export const LOCKOUT_MAX_MS = 15 * 60_000; // capped at 15 min
