'use client';

import { displayAddress, type OrderStatus } from '@loadless/shared';
import { PackagePlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { displayDateTime, displayMoney, displayPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useVendorOrdersList } from '@/features/orders/api';
import { OrderStatusBadge, STATUS_META } from '@/features/orders/order-status';

// Labels come from the shared `status` catalogue so a status reads the same
// word here, on the driver's screen and in the badge.
const TABS: Array<OrderStatus | 'ALL'> = [
  'ALL',
  'PENDING',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'DELIVERED',
  'CANCELLED',
];

export default function VendorOrdersPage() {
  const t = useTranslations('vendor.orders');
  const ts = useTranslations('status');
  const tc = useTranslations('common');
  const [tab, setTab] = useState<OrderStatus | 'ALL'>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useVendorOrdersList(tab, { from, to });

  const orders = data?.pages.flatMap((p) => p.data) ?? [];
  const filtered = from !== '' || to !== '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Link href="/vendor/orders/new">
          <Button>
            <PackagePlus /> {t('new')}
          </Button>
        </Link>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {TABS.map((key) => (
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
            {key === 'ALL' ? t('all') : ts(key)}
          </button>
        ))}
      </div>

      {/* Two equal columns on a phone so the pair always fits the width, a
          natural row from `sm` up. A vendor looking for "that order last
          Tuesday" should not have to scroll a list to find it. */}
      <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
        <div className="space-y-1.5">
          <Label htmlFor="vo-from">{t('from')}</Label>
          <DateField
            id="vo-from"
            className="w-full sm:w-44"
            value={from}
            onValueChange={setFrom}
            clearLabel={t('fromDate')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vo-to">{t('to')}</Label>
          <DateField
            id="vo-to"
            className="w-full sm:w-44"
            value={to}
            onValueChange={setTo}
            clearLabel={t('toDate')}
          />
        </div>
        {filtered && (
          <Button
            variant="ghost"
            className="col-span-2 h-10 justify-self-start sm:col-span-1"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            <X /> {t('clearDates')}
          </Button>
        )}
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
                      <span className="data-mono text-sm font-semibold">
                        <bdi>{order.orderNumber}</bdi>
                      </span>
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
                            {t('driver', { name: order.driver.fullName })} ·{' '}
                            <span dir="ltr" className="data-mono">
                              {displayPhone(order.driver.contactPhone)}
                            </span>
                          </p>
                        )}
                      </div>
                      <div className="text-end">
                        <p className="data-mono text-sm font-semibold">
                          <bdi>{displayMoney(order.deliveryCharge, order.currency)}</bdi>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <bdi>{displayDateTime(order.createdAt)}</bdi>
                        </p>
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
                {tc('loadMore')}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <PackagePlus className="size-8 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">{filtered ? t('emptyFiltered') : t('empty')}</p>
            <p className="text-sm text-muted-foreground">
              {filtered ? t('emptyFilteredBody') : t('emptyBody')}
            </p>
          </div>
          {filtered ? (
            <Button
              variant="outline"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
            >
              <X /> {t('clearDates')}
            </Button>
          ) : (
            <Link href="/vendor/orders/new">
              <Button>
                <PackagePlus /> {t('new')}
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
