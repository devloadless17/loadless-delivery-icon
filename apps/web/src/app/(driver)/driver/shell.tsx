'use client';

import { Bike, CircleDollarSign, Radar, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { BrandMark } from '@/components/brand';
import { InstallBanner } from '@/components/install-banner';
import { DutyToggle } from '@/features/driver/duty-toggle';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/driver', key: 'feed', icon: Radar, exact: true },
  { href: '/driver/active', key: 'active', icon: Bike },
  { href: '/driver/earnings', key: 'earnings', icon: CircleDollarSign },
  { href: '/driver/profile', key: 'profile', icon: User },
];

/**
 * Mobile-first driver shell: brand + duty control up top (duty toggle mounts
 * here in the driver-workflow phase), thumb-reach bottom navigation, safe-area
 * aware on installed PWAs.
 */
export function DriverShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations('driver.nav');

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header
        className="sticky top-0 z-20 flex h-14 items-center justify-between border-b bg-card/95 px-4 backdrop-blur"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <BrandMark className="size-7" />
        <DutyToggle />
      </header>

      <div className="pt-2">
        <InstallBanner />
      </div>
      <main className="flex-1 px-4 py-2 pb-24">{children}</main>

      <nav
        aria-label={t('label')}
        className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-lg border-t bg-card/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-4">
          {TABS.map(({ href, key, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-150',
                  active ? 'text-primary-strong' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150',
                    active && 'bg-primary/12',
                  )}
                >
                  <Icon className={cn('size-5', active && 'stroke-[2.25]')} aria-hidden />
                </span>
                {t(key)}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
