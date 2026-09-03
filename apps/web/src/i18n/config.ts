/**
 * Locale plumbing shared by the server (which resolves the locale from a
 * cookie) and the client (which switches it).
 *
 * The choice lives in a COOKIE rather than localStorage — unlike the theme.
 * The vendor and driver layouts are Server Components, so a cookie lets the
 * server render the correct language and direction in the FIRST response. With
 * localStorage the server would always emit English/LTR and the client would
 * repaint into Arabic/RTL after hydration: a visible flip of the whole layout
 * on every load, and a hydration mismatch. localStorage is mirrored only so a
 * future non-cookie reader has it.
 */
export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

/** English, per the product decision — Arabic is opt-in. */
export const DEFAULT_LOCALE: Locale = 'en';

export const LOCALE_COOKIE = 'fd_locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function dirFor(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
