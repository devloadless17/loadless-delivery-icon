'use client';

import { RotateCcw } from 'lucide-react';
import { formatMoney } from '@loadless/shared';
import { displayRelative } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { OrderStatusBadge } from '@/features/orders/order-status';
import type { CustomerOrder, CustomerProfile } from '../api';

/**
 * The highest-value pixel on the screen: the sentence the vendor says next.
 * "Delivering to Hamra Bldg 12 like last time? That was 3 days ago."
 */
export function LastOrderLine({
  order,
  customer,
  dense,
  onRepeat,
  repeatLabel = 'Repeat order',
}: {
  order: CustomerOrder;
  customer: CustomerProfile;
  dense?: boolean;
  onRepeat: (order: CustomerOrder, customer: CustomerProfile) => void;
  repeatLabel?: string;
}) {
  return (
    <div className="rounded-lg border border-primary/20 bg-card px-3.5 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <RotateCcw className="size-3.5 text-primary" aria-hidden />
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Last order
        </span>
        <span className="data-mono text-xs font-semibold">{order.orderNumber}</span>
        <span className="text-xs text-muted-foreground">· {displayRelative(order.createdAt)}</span>
        {!dense && <OrderStatusBadge status={order.status} className="ml-auto" />}
      </div>
      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{order.deliveryAddressText}</p>
          <p className="data-mono text-xs text-muted-foreground">
            {formatMoney(order.deliveryCharge, order.currency)}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => onRepeat(order, customer)}
        >
          <RotateCcw /> {repeatLabel}
        </Button>
      </div>
    </div>
  );
}
