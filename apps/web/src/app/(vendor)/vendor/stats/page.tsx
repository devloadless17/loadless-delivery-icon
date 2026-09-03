'use client';

import { useQuery } from '@tanstack/react-query';
import { formatMoney, type Currency, type OrderStatus } from '@loadless/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { STATUS_META } from '@/features/orders/order-status';

interface VendorStats {
  byStatus: Partial<Record<OrderStatus, number>>;
  delivered: Array<{ currency: Currency; count: number; deliveryVolume: string }>;
}

const STATUS_ORDER: OrderStatus[] = [
  'PENDING',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
];

export default function VendorStatsPage() {
  const t = useTranslations('vendor.stats');
  const tv = useTranslations('vendor.orders');
  const ts = useTranslations('statusLong');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data, isPending } = useQuery({
    queryKey: ['vendor', 'analytics', from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get<VendorStats>(`/vendor/analytics?${params}`);
    },
  });

  const total = data
    ? STATUS_ORDER.reduce((sum, s) => sum + (data.byStatus[s] ?? 0), 0)
    : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="stats-from">{tv('from')}</Label>
          <DateField id="stats-from" className="w-44" value={from} onValueChange={setFrom} clearLabel={tv('fromDate')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="stats-to">{tv('to')}</Label>
          <DateField id="stats-to" className="w-44" value={to} onValueChange={setTo} clearLabel={tv('toDate')} />
        </div>
      </div>

      {isPending || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t('orders')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="data-mono text-3xl font-bold">{total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('deliveredVolume')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.delivered.length === 0 ? (
                  // An em dash, not "0": a bare zero under a money label reads
                  // as zero of no currency. Matches StatStrip on the customer
                  // panel, which already renders empty money this way.
                  <p className="data-mono text-3xl font-bold text-muted-foreground">—</p>
                ) : (
                  data.delivered.map((row) => (
                    <p key={row.currency} className="data-mono text-xl font-bold leading-tight">
                      {formatMoney(row.deliveryVolume, row.currency)}
                    </p>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('byStatus')}</CardTitle>
            </CardHeader>
            <CardContent>
              {total === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('noneInRange')}</p>
              ) : (
                <ul className="space-y-2.5">
                  {STATUS_ORDER.map((status) => {
                    const count = data.byStatus[status] ?? 0;
                    if (count === 0) return null;
                    const meta = STATUS_META[status];
                    return (
                      <li key={status} className="flex items-center gap-3">
                        <span className="flex w-36 items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={`size-2 rounded-full ${meta.dotClass}`} aria-hidden />
                          {ts(status)}
                        </span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${meta.railClass}`}
                            style={{ width: `${Math.max(3, (count / total) * 100)}%` }}
                          />
                        </div>
                        <span className="data-mono w-10 text-end text-xs font-semibold">{count}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
