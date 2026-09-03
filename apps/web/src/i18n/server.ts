import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from './config';
import ar from './messages/ar.json';
import en from './messages/en.json';

/**
 * The locale for THIS request, read from the cookie. Only the vendor, driver
 * and login trees call it — admin never does, so the operator console stays
 * English whatever a shared device has stored.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function messagesFor(locale: Locale) {
  return locale === 'ar' ? ar : en;
}
