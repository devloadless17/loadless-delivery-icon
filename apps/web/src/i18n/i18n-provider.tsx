'use client';

import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { dirFor, type Locale } from './config';

/**
 * Wraps a subtree in its language AND its direction.
 *
 * `dir` is set on a wrapper rather than on <html> on purpose: the root layout
 * is shared with the admin console, which stays English/LTR. `display:contents`
 * keeps this element out of layout entirely — it draws no box, but `direction`
 * is an inherited property so everything below it, including the driver's
 * fixed bottom nav, still flips.
 */
export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Record<string, unknown>;
  children: ReactNode;
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Beirut">
      <div dir={dirFor(locale)} lang={locale} style={{ display: 'contents' }}>
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
