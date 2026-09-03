import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './config';
import ar from './messages/ar.json';
import en from './messages/en.json';

/**
 * The locale for THIS request, read from the cookie. Only the vendor, driver
 * and login trees call it — admin never does, so the operator console stays
 * English whatever a shared device has stored.
 */
export async function getLocale(): Promise<Locale> {
  // The middleware has already applied the rule that /admin is always English,
  // so prefer its answer. The cookie is the fallback for routes the matcher
  // does not cover (/offline, error pages).
  const headerLocale = (await headers()).get('x-fd-locale');
  if (isLocale(headerLocale)) return headerLocale;
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function messagesFor(locale: Locale) {
  return locale === 'ar' ? ar : en;
}
