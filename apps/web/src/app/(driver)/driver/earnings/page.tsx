'use client';

import { useQuery } from '@tanstack/react-query';
import { formatMoney, type Currency } from '@loadless/shared';
import { CircleDollarSign } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { displayDateTime, displayMoney } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useDriverOrders } from '@/features/driver/api';
import { OrderStatusBadge } from '@/features/orders/order-status';
import { MySettlements, OwedPanel } from '@/features/driver/owed-panel';

interface EarningsRow {
  currency: Currency;
  deliveries: number;
  earnings: string;
}

interface Earnings {
  today: EarningsRow[];
  week: EarningsRow[];
  range: EarningsRow[] | null;
  failedThisWeek: number;
}

function EarningsCard({ title, rows }: { title: string; rows: EarningsRow[] }) {
  const t = useTranslations('driver.earnings');
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          // An em dash, not "0" — a bare zero under a money label reads as
          // zero of no currency.
          <p className="data-mono text-2xl font-bold text-muted-foreground">—</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              // Stacked, not a justified row: side by side, "75,000 LBP" and
              // the count fight for ~170px on a 390px phone and the amount
              // wraps into the caption. A driver reads this one-handed.
              <div key={row.currency}>
                <p className="data-mono whitespace-nowrap text-2xl font-bold text-accent">
                  <bdi>{formatMoney(row.earnings, row.currency)}</bdi>
                </p>
                <p className="text-xs text-muted-foreground">
                  {/* ICU plural: Arabic has six plural forms, so a
                      count===1 ternary would be wrong in half of them. */}
                  {t('deliveries', { count: row.deliveries })}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DriverEarningsPage() {
  const t = useTranslations('driver.earnings');
  const tc = useTranslations('common');
  const { data, isPending } = useQuery({
    queryKey: ['driver', 'earnings'],
    queryFn: () => api.get<Earnings>('/driver/earnings'),
  });
  const history = useDriverOrders('history');
  const orders = history.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {/* What he owes comes FIRST. It is the number he needs before he walks
          into the office, and burying it under his takings would be the wrong
          way round. */}
      <OwedPanel />

      {isPending || !data ? (
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <EarningsCard title={t('today')} rows={data.today} />
          <EarningsCard title={t('week')} rows={data.week} />
        </div>
      )}

      <MySettlements />

      <h2 className="pt-2 text-base font-semibold">{t('completed')}</h2>
      {history.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : orders.length > 0 ? (
        <ul className="space-y-2">
          {orders.map((order) => (
            <li
              key={order.id}
              className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="data-mono text-sm font-semibold">
                    <bdi>{order.orderNumber}</bdi>
                  </span>
                  <OrderStatusBadge status={order.status} />
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {order.vendor.businessName} ·{' '}
                  <bdi>
                    {order.deliveredAt
                      ? displayDateTime(order.deliveredAt)
                      : displayDateTime(order.createdAt)}
                  </bdi>
                </p>
              </div>
              {order.status === 'DELIVERED' && order.driverEarnings && (
                <span className="data-mono shrink-0 text-sm font-bold text-accent">
                  <bdi>+{displayMoney(order.driverEarnings, order.currency)}</bdi>
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-14 text-center">
          <CircleDollarSign className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('empty')}</p>
        </div>
      )}
      {history.hasNextPage && (
        <button
          type="button"
          onClick={() => void history.fetchNextPage()}
          className="w-full cursor-pointer py-2 text-center text-sm text-primary-strong hover:underline"
        >
          {history.isFetchingNextPage ? tc('loading') : tc('showMore')}
        </button>
      )}
    </div>
  );
}
