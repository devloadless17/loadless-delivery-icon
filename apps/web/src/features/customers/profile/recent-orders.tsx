'use client';

import { PackageSearch } from 'lucide-react';
import { displayAddress, formatMoney } from '@loadless/shared';
import { displayRelative } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { OrderStatusBadge } from '@/features/orders/order-status';
import { useCustomerOrders, type CustomerProfile } from '../api';

/**
 * This customer's history WITH THIS VENDOR. Seeded from the profile payload,
 * so opening the tab costs zero requests; only "Load more" hits the network.
 */
export function RecentOrders({ customer }: { customer: CustomerProfile }) {
  const query = useCustomerOrders(customer.id, {
    orders: customer.recentOrders,
    nextCursor: customer.recentOrdersNextCursor,
  });
  const orders = query.data?.pages.flatMap((page) => page.data) ?? [];

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center">
        <PackageSearch className="size-7 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">No orders with you yet</p>
        <p className="text-sm text-muted-foreground">
          Their orders with other vendors are not yours to see.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {orders.map((order) => (
          <li
            key={order.id}
            className="flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="data-mono text-sm font-semibold">{order.orderNumber}</span>
                <OrderStatusBadge status={order.status} />
                {order.vendorName && (
                  <span className="text-xs text-muted-foreground">{order.vendorName}</span>
                )}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {displayAddress(order.deliveryAddressText, order.deliveryMapsUrl)} ·{' '}
                {displayRelative(order.createdAt)}
              </p>
            </div>
            <span className="data-mono shrink-0 text-sm font-semibold">
              {formatMoney(order.deliveryCharge, order.currency)}
            </span>
          </li>
        ))}
      </ul>

      {query.isError && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2 text-sm">
          <span>Couldn&apos;t load more orders.</span>
          <Button size="sm" variant="ghost" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {query.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
