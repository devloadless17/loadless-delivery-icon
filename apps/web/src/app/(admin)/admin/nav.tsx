'use client';

import {
  Bike,
  LayoutDashboard,
  Package,
  Settings,
  Store,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/orders', label: 'Orders', icon: Package },
  { href: '/admin/vendors', label: 'Vendors', icon: Store },
  { href: '/admin/drivers', label: 'Drivers', icon: Bike },
  { href: '/admin/customers', label: 'Customers', icon: Users },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 p-3" aria-label="Admin">
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
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
