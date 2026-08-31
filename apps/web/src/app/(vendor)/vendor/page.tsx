'use client';

import { displayAddress, type OrderStatus } from '@loadless/shared';
import { PackagePlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { displayDateTime, displayMoney, displayPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useVendorOrdersList } from '@/features/orders/api';
import { OrderStatusBadge, STATUS_META } from '@/features/orders/order-status';

const TABS: Array<{ key: OrderStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Waiting' },
  { key: 'DRIVER_ASSIGNED', label: 'Assigned' },
  { key: 'PICKED_UP', label: 'On the way' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

export default function VendorOrdersPage() {
  const [tab, setTab] = useState<OrderStatus | 'ALL'>('ALL');
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useVendorOrdersList(tab);

  const orders = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Orders</h1>
        <Link href="/vendor/orders/new">
          <Button>
            <PackagePlus /> New order
          </Button>
        </Link>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150',
              tab === key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : orders.length > 0 ? (
        <>
          <ul className="space-y-2">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/vendor/orders/${order.id}`}
                  className="flex overflow-hidden rounded-lg border bg-card transition-colors duration-150 hover:border-primary/40"
                >
                  <span className={cn('w-1.5 shrink-0', STATUS_META[order.status].railClass)} aria-hidden />
                  <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="data-mono text-sm font-semibold">{order.orderNumber}</span>
                      <OrderStatusBadge status={order.status} />
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{order.customer.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {displayAddress(order.deliveryAddressText, order.deliveryMapsUrl)}
                        </p>
                        {order.driver && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Driver: {order.driver.fullName} ·{' '}
                            <span className="data-mono">{displayPhone(order.driver.contactPhone)}</span>
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="data-mono text-sm font-semibold">
                          {displayMoney(order.deliveryCharge, order.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">{displayDateTime(order.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <PackagePlus className="size-8 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">No orders here yet</p>
            <p className="text-sm text-muted-foreground">Create an order and drivers will see it instantly.</p>
          </div>
          <Link href="/vendor/orders/new">
            <Button>
              <PackagePlus /> New order
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
