import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { fontVariables } from '@/lib/fonts';
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontVariables} min-h-dvh`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
