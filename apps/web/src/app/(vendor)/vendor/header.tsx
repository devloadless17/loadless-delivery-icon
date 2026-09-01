'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from '@/components/brand';
import { fileUrl } from '@/lib/format';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/features/auth/use-me';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/vendor', label: 'Orders', exact: true },
  { href: '/vendor/orders/new', label: 'New order' },
  { href: '/vendor/customers', label: 'Customers' },
  { href: '/vendor/stats', label: 'Stats' },
  { href: '/vendor/settings', label: 'Settings' },
];

export function VendorHeader() {
  const pathname = usePathname();
  const { data, isPending } = useMe();
  const businessName = data?.user.vendor?.businessName;

  return (
    <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {data?.user.vendor?.logoKey ? (
            <img
              src={fileUrl(data.user.vendor.logoKey)}
              alt=""
              className="size-8 shrink-0 rounded-lg border object-cover shadow-card"
            />
          ) : (
            <BrandMark className="size-7 shrink-0" />
          )}
          {isPending ? (
            <Skeleton className="h-4 w-32" />
          ) : (
            <span className="truncate font-display text-base font-semibold">
              {businessName ?? 'Vendor'}
            </span>
          )}
        </div>
        <div className="flex items-center">
          <ThemeToggle />
          <SignOutButton iconOnly />
        </div>
      </div>
      <nav className="mx-auto w-full max-w-5xl px-4" aria-label="Vendor">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(({ href, label, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors duration-150',
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
