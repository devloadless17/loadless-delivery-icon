'use client';

import { displayAddress } from '@loadless/shared';
import { Bike } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { displayMoney, displayPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useDriverOrders } from '@/features/driver/api';
import { OrderStatusBadge, STATUS_META } from '@/features/orders/order-status';

export default function DriverActivePage() {
  const t = useTranslations('driver.active');
  const { data, isPending } = useDriverOrders('active');
  const orders = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : orders.length > 0 ? (
        <ul className="space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <Link
                href={`/driver/orders/${order.id}`}
                className="flex overflow-hidden rounded-lg border bg-card transition-colors duration-150 active:bg-muted/50"
              >
                <span className={cn('w-1.5 shrink-0', STATUS_META[order.status].railClass)} aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="data-mono text-sm font-semibold">
                      <bdi>{order.orderNumber}</bdi>
                    </span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{order.vendor.businessName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {displayAddress(order.deliveryAddressText, order.deliveryMapsUrl)}
                      </p>
                      <p className="data-mono mt-0.5 text-xs text-muted-foreground">
                        {order.customer.name} · <bdi>{displayPhone(order.customer.normalizedPhone)}</bdi>
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="data-mono text-sm font-bold text-accent">
                        <bdi>
                          {order.driverEarnings
                            ? `+${displayMoney(order.driverEarnings, order.currency)}`
                            : ''}
                        </bdi>
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Bike className="size-9 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">{t('empty')}</p>
            <p className="text-sm text-muted-foreground">{t('emptyBody')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
