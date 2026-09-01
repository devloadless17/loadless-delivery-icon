'use client';

import {
  Bike,
  LayoutDashboard,
  Package,
  Settings,
  Store,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export const ADMIN_NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/orders', label: 'Orders', icon: Package },
  { href: '/admin/vendors', label: 'Vendors', icon: Store },
  { href: '/admin/drivers', label: 'Drivers', icon: Bike },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/settlements', label: 'Settlements', icon: Wallet },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

/**
 * The links themselves, shared by the desktop sidebar and the mobile drawer so
 * a new admin section can never appear in one and be missing from the other.
 * `onNavigate` lets the drawer close itself on a tap.
 */
export function AdminNavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav className={cn('flex-1 space-y-1 p-3', className)} aria-label="Admin">
      {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              // min-h-11 keeps every row a comfortable tap target on a phone;
              // on the desktop sidebar it is indistinguishable from before.
              'relative flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
              active
                ? 'bg-primary/10 text-primary shadow-none'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {active && (
              <span
                className="absolute -left-3 h-5 w-1 rounded-r-full bg-primary"
                aria-hidden
              />
            )}
            <Icon className={cn('size-4.5', active && 'stroke-[2.25]')} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminNav() {
  return <AdminNavLinks />;
}
