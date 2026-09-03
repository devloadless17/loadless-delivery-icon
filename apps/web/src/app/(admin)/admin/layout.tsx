import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AdminNav } from './nav';
import { AdminMobileNav } from './mobile-nav';
import { RealtimeProvider } from '@/components/realtime-provider';
import { BrandWordmark } from '@/components/brand';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { I18nProvider } from '@/i18n/i18n-provider';
import en from '@/i18n/messages/en.json';

export const metadata: Metadata = { title: { default: 'Admin', template: '%s · Flash Delivery Admin' } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    // The operator console stays English and LTR whatever language this device
    // last used for the vendor or driver app — translating it would triple the
    // work for no user benefit (CLAUDE.md / product decision). The nested
    // provider's dir="ltr" wrapper overrides an RTL ancestor.
    <I18nProvider locale="en" messages={en}>
    <RealtimeProvider>
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card lg:flex">
        <div className="flex h-16 items-center px-5">
          <BrandWordmark />
        </div>
        <div className="px-5 pb-2 pt-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Control room
          </p>
        </div>
        <AdminNav />
        <div className="mx-3 mb-3 flex items-center justify-between rounded-lg border bg-background/60 p-2">
          <SignOutButton />
          <ThemeToggle />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between gap-3 border-b bg-card px-4 lg:hidden">
          <div className="flex min-w-0 items-center gap-1">
            <AdminMobileNav />
            <BrandWordmark />
          </div>
          <div className="flex items-center">
            <ThemeToggle />
            <SignOutButton iconOnly />
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
    </RealtimeProvider>
    </I18nProvider>
  );
}