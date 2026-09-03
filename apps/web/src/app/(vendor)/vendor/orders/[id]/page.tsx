'use client';

import { ArrowLeft, Phone } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { displayDateTime, displayMoney, displayPhone, fileUrl, initialsOf } from '@/lib/format';
import { MapsLinkButton } from '@/components/maps-link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useCancelOrder, useVendorOrder } from '@/features/orders/api';
import { displayAddress } from '@loadless/shared';
import { OrderStatusBadge } from '@/features/orders/order-status';
import { OrderTimeline } from '@/features/orders/order-timeline';

export default function VendorOrderDetailPage() {
  const t = useTranslations('vendor.order');
  const { id } = useParams<{ id: string }>();
  const { data: order, isPending } = useVendorOrder(id);
  const cancelOrder = useCancelOrder();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  async function confirmCancel() {
    if (reason.trim().length < 3) {
      toast.error(t('reasonRequired'));
      return;
    }
    try {
      await cancelOrder.mutateAsync({ id, reason: reason.trim() });
      toast.success(t('cancelledToast'));
      setCancelOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('cancelFailed'));
    }
  }

  if (isPending) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-60 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!order) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <div className="flex items-center gap-3">
        <Link
          href="/vendor"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={t('backToOrders')}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex flex-1 items-center justify-between gap-3">
          <h1 dir="ltr" className="data-mono text-xl font-semibold">{order.orderNumber}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('delivery')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{order.customer.name}</p>
              <a
                href={`tel:${order.customer.normalizedPhone}`}
                dir="ltr"
                className="data-mono text-sm text-primary-strong hover:underline"
              >
                {displayPhone(order.customer.normalizedPhone)}
              </a>
              <p className="mt-1 text-sm text-muted-foreground">
                {displayAddress(order.deliveryAddressText, order.deliveryMapsUrl)}
              </p>
              {order.deliveryInstructions && (
                <p className="mt-1 text-sm text-muted-foreground">“{order.deliveryInstructions}”</p>
              )}
            </div>
            <p className="data-mono text-lg font-semibold">
              {displayMoney(order.deliveryCharge, order.currency)}
            </p>
          </div>
          {order.deliveryMapsUrl && <MapsLinkButton url={order.deliveryMapsUrl} size="sm" />}
        </CardContent>
      </Card>

      {order.driver && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('driver')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {/* The whole point of the face photo: check who is at the
                    counter before handing the package over. */}
                {order.driver.facePhotoKey ? (
                  <img
                    src={fileUrl(order.driver.facePhotoKey)}
                    alt={`${order.driver.fullName}, the assigned driver`}
                    className="size-11 shrink-0 rounded-full border object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted font-display text-sm font-semibold text-muted-foreground"
                  >
                    {initialsOf(order.driver.fullName)}
                  </span>
                )}
                <p className="truncate text-sm font-medium">{order.driver.fullName}</p>
              </div>
              <a href={`tel:${order.driver.contactPhone}`}>
                <Button variant="outline" size="sm">
                  <Phone />{' '}
                  <span dir="ltr" className="data-mono">{displayPhone(order.driver.contactPhone)}</span>
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('timeline')}</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderTimeline entries={order.statusHistory ?? []} />
          <p className="mt-3 text-xs text-muted-foreground">
            {t('created', { when: displayDateTime(order.createdAt) })}
          </p>
        </CardContent>
      </Card>

      {order.status === 'PENDING' && (
        <Button variant="destructive" className="w-full" onClick={() => setCancelOpen(true)}>
          {t('cancelOrder')}
        </Button>
      )}
      {order.status === 'DRIVER_ASSIGNED' || order.status === 'PICKED_UP' ? (
        <p className="text-center text-xs text-muted-foreground">{t('driverHasOrder')}</p>
      ) : null}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('cancelTitle')}</DialogTitle>
            <DialogDescription>{t('cancelBody')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">{t('reason')}</Label>
            <Input
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('cancelPlaceholder')}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              {t('keepOrder')}
            </Button>
            <Button variant="destructive" loading={cancelOrder.isPending} onClick={() => void confirmCancel()}>
              {t('cancelOrder')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
