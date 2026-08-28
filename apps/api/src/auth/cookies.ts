import type { Response } from 'express';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  secure: boolean,
): void {
  // The JWT inside carries the real 15-min expiry; the cookie itself lives as
  // long as the refresh token so role-based routing (middleware) keeps working
  // while the client silently refreshes an expired access token.
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(res: Response, secure: boolean): void {
  res.cookie(ACCESS_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  res.cookie(REFRESH_COOKIE, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: REFRESH_COOKIE_PATH,
    maxAge: 0,
  });
}
