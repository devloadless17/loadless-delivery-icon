import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { VendorHeader } from './header';
import { RealtimeProvider } from '@/components/realtime-provider';

export const metadata: Metadata = { title: { default: 'Vendor', template: '%s · Loadless' } };

export default function VendorLayout({ children }: { children: ReactNode }) {
  return (
    <RealtimeProvider>
      <div className="flex min-h-dvh flex-col">
        <VendorHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </RealtimeProvider>
  );
}
