'use client';

import { DirectionProvider } from '@radix-ui/react-direction';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { dirFor, type Locale } from './config';

/**
 * Messages and reading direction for the client tree.
 *
 * It renders no DOM of its own. Direction reaches the page two ways, and BOTH
 * are needed:
 *
 *  1. `dir` on <html> (set by the root layout) — inherited CSS direction, which
 *     is what ordinary markup and the portalled DOM under document.body pick
 *     up, and what Sonner reads off documentElement.
 *  2. Radix's DirectionProvider — Radix does NOT inherit. Every primitive reads
 *     this context (defaulting to 'ltr') and writes an explicit dir attribute
 *     onto its content, including content it portals to document.body. Without
 *     this the confirm dialogs and the currency dropdown render LTR inside an
 *     otherwise RTL app, which is exactly where the driver's irreversible
 *     actions live.
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
      <DirectionProvider dir={dirFor(locale)}>{children}</DirectionProvider>
    </NextIntlClientProvider>
  );
}
