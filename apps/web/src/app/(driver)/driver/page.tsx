'use client';

import { displayAddress, ERROR_CODES } from '@loadless/shared';
import { MapPin, Radar, Store } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { displayDateTime, displayMoney, fileUrl } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/features/auth/use-me';
import { useAcceptOrder, useAvailableOrders, type FeedOrder } from '@/features/driver/api';
import { DutyToggle } from '@/features/driver/duty-toggle';

function FeedCard({ order }: { order: FeedOrder }) {
  const t = useTranslations('driver.feed');
  const acceptOrder = useAcceptOrder();
  const [gone, setGone] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function accept() {
    try {
      await acceptOrder.mutateAsync(order.id);
      toast.success(t('yours', { orderNumber: order.orderNumber }));
    } catch (err) {
      if (err instanceof ApiError && err.code === ERROR_CODES.ORDER_NO_LONGER_AVAILABLE) {
        setGone(true);
        toast.info(t('justTaken'));
      } else if (err instanceof ApiError && err.code === ERROR_CODES.DRIVER_NOT_AVAILABLE) {
        toast.error(err.message);
      } else {
        toast.error(t('acceptFailed'));
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
              <p className="text-xs text-muted-foreground">
                <bdi>{displayDateTime(order.createdAt)}</bdi>
              </p>
            </div>
          </div>
          <p className="data-mono text-base font-bold">
            <bdi>{displayMoney(order.deliveryCharge, order.currency)}</bdi>
          </p>
        </div>
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            {displayAddress(order.deliveryAddressText, order.deliveryMapsUrl)}
            {order.deliveryMapsUrl && (
              <span className="ms-1.5 inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {t('mapsLink')}
              </span>
            )}
          </span>
        </p>
        <Button variant="live" size="touch" onClick={() => setConfirming(true)}>
          {t('accept')}
        </Button>

        {/* Accepting is a commitment, not a preference: it takes the order off
            every other driver's feed and locks the vendor out of cancelling.
            A mistap while scrolling a live feed one-handed would strand a real
            delivery, so it asks — the same way delivering does. */}
        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('takeThis')}</DialogTitle>
              <DialogDescription>
                {order.vendor.businessName} ·{' '}
                {displayAddress(order.deliveryAddressText, order.deliveryMapsUrl)}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="lg" onClick={() => setConfirming(false)}>
                {t('notNow')}
              </Button>
              <Button
                variant="live"
                size="lg"
                loading={acceptOrder.isPending}
                onClick={() => {
                  setConfirming(false);
                  void accept();
                }}
              >
                {t('yesAccept')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </li>
  );
}

export default function DriverFeedPage() {
  const t = useTranslations('driver.feed');
  const tc = useTranslations('common');
  const { data: me, isPending: mePending } = useMe();
  const onDuty = me?.user.driver?.dutyStatus === 'ON_DUTY';
  const feed = useAvailableOrders();
  const orders = feed.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      {mePending ? (
        <Skeleton className="h-40 w-full rounded-lg" />
      ) : !onDuty ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed py-16 text-center">
          <Radar className="size-9 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">{t('offDuty')}</p>
            <p className="text-sm text-muted-foreground">{t('offDutyBody')}</p>
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
                {tc('loadMore')}
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Radar className="size-9 text-accent" aria-hidden />
          <div>
            <p className="font-medium">{t('watching')}</p>
            <p className="text-sm text-muted-foreground">{t('watchingBody')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
