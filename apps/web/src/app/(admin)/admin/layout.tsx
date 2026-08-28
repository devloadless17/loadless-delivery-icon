import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminNav } from './nav';
import { BrandWordmark } from '@/components/brand';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Loadless Admin' } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card lg:flex">
        <div className="flex h-16 items-center border-b px-5">
          <BrandWordmark />
        </div>
        <AdminNav />
        <div className="flex items-center justify-between border-t p-3">
          <SignOutButton />
          <ThemeToggle />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-3 border-b bg-card px-4 lg:hidden">
          <BrandWordmark />
          <div className="flex items-center">
            <ThemeToggle />
            <SignOutButton iconOnly />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
