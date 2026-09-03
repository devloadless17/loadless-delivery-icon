import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { fontVariables } from '@/lib/fonts';
import { dirFor } from '@/i18n/config';
import { I18nProvider } from '@/i18n/i18n-provider';
import { getLocale, messagesFor } from '@/i18n/server';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Flash Delivery',
    template: '%s · Flash Delivery',
  },
  description: 'Delivery operations platform',
  applicationName: 'Flash Delivery',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Flash Delivery',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f4' },
    { media: '(prefers-color-scheme: dark)', color: '#0a101e' },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    // dir/lang belong on <html>, not on a wrapper: Radix portals (dialogs,
    // selects) mount on document.body and Sonner reads
    // document.documentElement.direction, so anything nested leaves every
    // dialog and toast LTR in Arabic. The middleware has already pinned
    // /admin to English.
    <html lang={locale} dir={dirFor(locale)} suppressHydrationWarning>
      <body className={`${fontVariables} min-h-dvh`}>
        {/*
          One provider over the whole app, on the locale the middleware
          resolved. next-intl's useTranslations throws with no provider above
          it, and shared components (sign-out, change-password, the status
          badge) render in every role — so this has to be at the root. Because
          the middleware already answers "is this admin?", globally-mounted UI
          like the update toast and Sonner get the right language too.
        */}
        <I18nProvider locale={locale} messages={messagesFor(locale)}>
          <Providers>{children}</Providers>
        </I18nProvider>
      </body>
    </html>
  );
}
