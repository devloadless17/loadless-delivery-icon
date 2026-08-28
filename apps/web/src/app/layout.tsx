import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { fontVariables } from '@/lib/fonts';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Loadless',
    template: '%s · Loadless',
  },
  description: 'Delivery operations platform',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
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
