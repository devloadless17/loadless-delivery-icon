'use client';

import { displayAddress } from '@loadless/shared';
import { ArrowLeft, Navigation, Phone, Store } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { displayMoney, displayPhone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  useDeliverOrder,
  useDriverOrder,
  useFailOrder,
  usePickupOrder,
  useReleaseOrder,
} from '@/features/driver/api';
import { OrderStatusBadge } from '@/features/orders/order-status';

export default function DriverOrderDetailPage() {
  const t = useTranslations('driver.order');
  const tc = useTranslations('common');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: order, isPending } = useDriverOrder(id);
  const pickupOrder = usePickupOrder();
  const deliverOrder = useDeliverOrder();
  const releaseOrder = useReleaseOrder();
  const failOrder = useFailOrder();
  const [reasonDialog, setReasonDialog] = useState<'release' | 'fail' | null>(null);
  const [reason, setReason] = useState('');
  const [confirmDeliver, setConfirmDeliver] = useState(false);

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!order) return null;

  async function act(action: 'pickup' | 'deliver') {
    try {
      if (action === 'pickup') {
        await pickupOrder.mutateAsync(order!.id);
        toast.success(t('pickedUpToast'));
      } else {
        await deliverOrder.mutateAsync(order!.id);
        toast.success(t('deliveredToast'));
        router.push('/driver/active');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tc('somethingWrong'));
    }
  }

  async function submitReason() {
    if (reason.trim().length < 3) {
      toast.error(t('reasonRequired'));
      return;
    }
    try {
      if (reasonDialog === 'release') {
        await releaseOrder.mutateAsync({ id: order!.id, reason: reason.trim() });
        toast.success(t('releasedToast'));
        router.push('/driver');
      } else {
        await failOrder.mutateAsync({ id: order!.id, reason: reason.trim() });
        toast.success(t('failedToast'));
        router.push('/driver/active');
      }
      setReasonDialog(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : tc('somethingWrong'));
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/driver/active"
          aria-label={tc('back')}
          className="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-5 rtl:rotate-180" />
        </Link>
        <span dir="ltr" className="data-mono flex-1 text-lg font-semibold">{order.orderNumber}</span>
        <OrderStatusBadge status={order.status} />
      </div>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Store className="size-4 text-muted-foreground" aria-hidden />
              {order.vendor.businessName}
            </div>
            {order.driverEarnings && (
              <p className="data-mono text-lg font-bold text-accent">
                +{displayMoney(order.driverEarnings, order.currency)}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <p className="text-sm font-semibold">{order.customer.name}</p>
            <p className="text-sm text-muted-foreground">
              {displayAddress(order.deliveryAddressText, order.deliveryMapsUrl)}
            </p>
            {order.deliveryInstructions && (
              <p className="text-sm text-muted-foreground">“{order.deliveryInstructions}”</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a href={`tel:${order.customer.normalizedPhone}`}>
              <Button variant="outline" className="w-full">
                <Phone /> {t('call')}
              </Button>
            </a>
            {/* "Location", not "Navigate": the word has to be understood at a
                glance by a driver who may not read English comfortably, and it
                matches "Open location" used everywhere else in the app. */}
            {order.deliveryMapsUrl ? (
              <a href={order.deliveryMapsUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full">
                  <Navigation /> {t('location')}
                </Button>
              </a>
            ) : (
              <Button variant="outline" disabled className="w-full">
                <Navigation /> {t('noLocation')}
              </Button>
            )}
          </div>
          {/* The numbers are isolated individually rather than forcing the
              whole line LTR — that used to leave the Arabic word for "charge"
              stranded inside a left-to-right sentence. */}
          <p className="flex flex-wrap items-baseline justify-center gap-x-2 text-xs text-muted-foreground">
            <bdi className="data-mono">{displayPhone(order.customer.normalizedPhone)}</bdi>
            <span aria-hidden>·</span>
            <span>
              {t('charge')}{' '}
              <bdi className="data-mono">
                {displayMoney(order.deliveryCharge, order.currency)}
              </bdi>
            </span>
          </p>
        </CardContent>
      </Card>

      {(order.status === 'DRIVER_ASSIGNED' || order.status === 'PICKED_UP') && (
        <div
          className="fixed inset-x-0 bottom-16 z-10 mx-auto w-full max-w-lg space-y-2 border-t bg-background/95 p-4 backdrop-blur"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          {order.status === 'DRIVER_ASSIGNED' ? (
            <>
              <Button variant="live" size="touch" loading={pickupOrder.isPending} onClick={() => void act('pickup')}>
                {t('pickedUpFrom', { vendor: order.vendor.businessName })}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setReason('');
                  setReasonDialog('release');
                }}
                className="w-full cursor-pointer py-1 text-center text-sm text-muted-foreground hover:text-foreground"
              >
                {t('release')}
              </button>
            </>
          ) : (
            <>
              <Button variant="live" size="touch" onClick={() => setConfirmDeliver(true)}>
                {t('delivered')}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setReason('');
                  setReasonDialog('fail');
                }}
                className="w-full cursor-pointer py-1 text-center text-sm text-muted-foreground hover:text-destructive"
              >
                {t('markFailed')}
              </button>
            </>
          )}
        </div>
      )}

      <Dialog open={confirmDeliver} onOpenChange={setConfirmDeliver}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmDelivery')}</DialogTitle>
            <DialogDescription>
              {order.driverEarnings
                ? t('handedToEarnings', {
                    customer: order.customer.name,
                    amount: displayMoney(order.driverEarnings, order.currency),
                  })
                : t('handedTo', { customer: order.customer.name })}
            </DialogDescription>
          </DialogHeader>
          {/* size="lg" (48px), not the 40px default: a driver taps these
              one-handed, in a hurry, often with a glove on. The default
              measured 38px on a phone — under every touch-target guideline,
              on the two actions that cannot be undone. */}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="lg" onClick={() => setConfirmDeliver(false)}>
              {t('notYet')}
            </Button>
            <Button
              variant="live"
              size="lg"
              loading={deliverOrder.isPending}
              onClick={() => {
                setConfirmDeliver(false);
                void act('deliver');
              }}
            >
              {t('yesDelivered')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reasonDialog !== null} onOpenChange={(open) => !open && setReasonDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reasonDialog === 'release' ? t('releaseTitle') : t('failTitle')}
            </DialogTitle>
            <DialogDescription>
              {reasonDialog === 'release' ? t('releaseBody') : t('failBody')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">{t('reason')}</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonDialog === 'release' ? t('releasePlaceholder') : t('failPlaceholder')}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="lg" onClick={() => setReasonDialog(null)}>
              {tc('cancel')}
            </Button>
            <Button
              variant={reasonDialog === 'fail' ? 'destructive' : 'default'}
              size="lg"
              loading={releaseOrder.isPending || failOrder.isPending}
              onClick={() => void submitReason()}
            >
              {tc('confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
