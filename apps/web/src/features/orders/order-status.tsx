import type { OrderStatus } from '@loadless/shared';
import { cn } from '@/lib/utils';

/**
 * The order lifecycle is the product's core vocabulary — one color story used
 * everywhere: amber = waiting, blue = claimed, orange = in motion,
 * green = delivered, gray = cancelled, red = failed.
 */
export const STATUS_META: Record<
  OrderStatus,
  { label: string; railClass: string; badgeClass: string; dotClass: string }
> = {
  PENDING: {
    label: 'Waiting for driver',
    railClass: 'bg-status-pending',
    badgeClass: 'bg-status-pending/15 text-status-pending',
    dotClass: 'bg-status-pending',
  },
  DRIVER_ASSIGNED: {
    label: 'Driver assigned',
    railClass: 'bg-status-assigned',
    badgeClass: 'bg-status-assigned/15 text-status-assigned',
    dotClass: 'bg-status-assigned',
  },
  PICKED_UP: {
    label: 'On the way',
    railClass: 'bg-status-picked-up',
    badgeClass: 'bg-status-picked-up/15 text-status-picked-up',
    dotClass: 'bg-status-picked-up',
  },
  DELIVERED: {
    label: 'Delivered',
    railClass: 'bg-status-delivered',
    badgeClass: 'bg-status-delivered/15 text-status-delivered',
    dotClass: 'bg-status-delivered',
  },
  CANCELLED: {
    label: 'Cancelled',
    railClass: 'bg-status-cancelled',
    badgeClass: 'bg-status-cancelled/15 text-status-cancelled',
    dotClass: 'bg-status-cancelled',
  },
  FAILED: {
    label: 'Failed',
    railClass: 'bg-status-failed',
    badgeClass: 'bg-status-failed/15 text-status-failed',
    dotClass: 'bg-status-failed',
  },
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        meta.badgeClass,
        className,
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          meta.dotClass,
          status === 'PICKED_UP' && 'animate-pulse',
        )}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}
