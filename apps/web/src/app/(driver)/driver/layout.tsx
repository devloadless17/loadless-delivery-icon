import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DriverShell } from './shell';

export const metadata: Metadata = { title: { default: 'Driver', template: '%s · Loadless' } };

export default function DriverLayout({ children }: { children: ReactNode }) {
  return <DriverShell>{children}</DriverShell>;
}
