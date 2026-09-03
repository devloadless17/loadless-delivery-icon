import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { fontVariables } from '@/lib/fonts';
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
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontVariables} min-h-dvh`}>
        {/*
          One provider over the WHOLE app, on the locale from the cookie. It
          exists at the root for two reasons: next-intl's useTranslations throws
          with no provider above it (and shared components like the sign-out
          button render in every role), and globally-mounted UI — the update
          toast, Sonner — would otherwise be stuck in English for an Arabic
          driver. The admin console nests its own English provider to opt out.
        */}
        <I18nProvider locale={locale} messages={messagesFor(locale)}>
          <Providers>{children}</Providers>
        </I18nProvider>
      </body>
    </html>
  );
}
