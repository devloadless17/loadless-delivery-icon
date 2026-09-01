import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DriverShell } from './shell';
import { RealtimeProvider } from '@/components/realtime-provider';

export const metadata: Metadata = { title: { default: 'Driver', template: '%s · Flash Delivery' } };

export default function DriverLayout({ children }: { children: ReactNode }) {
  return (
    <RealtimeProvider>
      <DriverShell>{children}</DriverShell>
    </RealtimeProvider>
  );
}
