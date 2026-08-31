'use client';

import { displayAddress, ERROR_CODES } from '@loadless/shared';
import { MapPin, Radar, Store } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { displayDateTime, displayMoney, fileUrl } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/features/auth/use-me';
import { useAcceptOrder, useAvailableOrders, type FeedOrder } from '@/features/driver/api';
import { DutyToggle } from '@/features/driver/duty-toggle';

function FeedCard({ order }: { order: FeedOrder }) {
  const acceptOrder = useAcceptOrder();
  const [gone, setGone] = useState(false);

  async function accept() {
    try {
      await acceptOrder.mutateAsync(order.id);
      toast.success(`Order ${order.orderNumber} is yours`);
    } catch (err) {
      if (err instanceof ApiError && err.code === ERROR_CODES.ORDER_NO_LONGER_AVAILABLE) {
        setGone(true);
        toast.info('That order was just taken.');
      } else if (err instanceof ApiError && err.code === ERROR_CODES.DRIVER_NOT_AVAILABLE) {
        toast.error(err.message);
      } else {
        toast.error('Could not accept the order. Try again.');
      }
    }
  }

  if (gone) return null;

  return (
    <li className="flex overflow-hidden rounded-lg border bg-card">
      <span className="w-1.5 shrink-0 bg-status-pending" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {order.vendor.logoKey ? (
              <img src={fileUrl(order.vendor.logoKey)} alt="" className="size-8 rounded-md border object-cover" />
            ) : (
              <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Store className="size-4" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{order.vendor.businessName}</p>
              <p className="text-xs text-muted-foreground">{displayDateTime(order.createdAt)}</p>
            </div>
          </div>
          <p className="data-mono text-base font-bold">
            {displayMoney(order.deliveryCharge, order.currency)}
          </p>
        </div>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            {displayAddress(order.deliveryAddressText, order.deliveryMapsUrl)}
            {order.deliveryMapsUrl && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                MAPS LINK
              </span>
            )}
          </span>
        </p>
        <Button variant="live" size="touch" loading={acceptOrder.isPending} onClick={() => void accept()}>
          Accept order
        </Button>
      </div>
    </li>
  );
}

export default function DriverFeedPage() {
  const { data: me, isPending: mePending } = useMe();
  const onDuty = me?.user.driver?.dutyStatus === 'ON_DUTY';
  const feed = useAvailableOrders();
  const orders = feed.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Available orders</h1>

      {mePending ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : !onDuty ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed py-16 text-center">
          <Radar className="size-9 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">You&apos;re off duty</p>
            <p className="text-sm text-muted-foreground">Go on duty to see orders the moment they appear.</p>
          </div>
          <DutyToggle />
        </div>
      ) : feed.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      ) : orders.length > 0 ? (
        <>
          <ul className="space-y-3">
            {orders.map((order) => (
              <FeedCard key={order.id} order={order} />
            ))}
          </ul>
          {feed.hasNextPage && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" loading={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Radar className="size-9 text-accent" aria-hidden />
          <div>
            <p className="font-medium">Watching for orders…</p>
            <p className="text-sm text-muted-foreground">
              New orders appear here instantly — keep the app open.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
