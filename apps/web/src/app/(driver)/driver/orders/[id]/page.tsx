'use client';

import { ArrowLeft, Navigation, Phone, Store } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { displayMoney, displayPhone } from '@/lib/format';
import { MapView } from '@/lib/map';
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

  const hasPin = order.deliveryLat != null && order.deliveryLng != null;

  async function act(action: 'pickup' | 'deliver') {
    try {
      if (action === 'pickup') {
        await pickupOrder.mutateAsync(order!.id);
        toast.success('Picked up — safe ride!');
      } else {
        await deliverOrder.mutateAsync(order!.id);
        toast.success('Delivered. Earnings added.');
        router.push('/driver/active');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong — try again.');
    }
  }

  async function submitReason() {
    if (reason.trim().length < 3) {
      toast.error('A short reason is required.');
      return;
    }
    try {
      if (reasonDialog === 'release') {
        await releaseOrder.mutateAsync({ id: order!.id, reason: reason.trim() });
        toast.success('Order released back to the feed.');
        router.push('/driver');
      } else {
        await failOrder.mutateAsync({ id: order!.id, reason: reason.trim() });
        toast.success('Marked as failed.');
        router.push('/driver/active');
      }
      setReasonDialog(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong — try again.');
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/driver/active"
          aria-label="Back"
          className="flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <span className="data-mono flex-1 text-lg font-semibold">{order.orderNumber}</span>
        <OrderStatusBadge status={order.status} />
      </div>

      {hasPin && (
        <div className="overflow-hidden rounded-lg border">
          <MapView
            position={{ lat: order.deliveryLat as number, lng: order.deliveryLng as number }}
            className="h-56 w-full"
          />
        </div>
      )}

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
            <p className="text-sm text-muted-foreground">{order.deliveryAddressText}</p>
            {order.deliveryInstructions && (
              <p className="text-sm text-muted-foreground">“{order.deliveryInstructions}”</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a href={`tel:${order.customer.normalizedPhone}`}>
              <Button variant="outline" className="w-full">
                <Phone /> Call
              </Button>
            </a>
            {hasPin ? (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${order.deliveryLat},${order.deliveryLng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="w-full">
                  <Navigation /> Navigate
                </Button>
              </a>
            ) : (
              <Button variant="outline" disabled className="w-full">
                <Navigation /> No pin
              </Button>
            )}
          </div>
          <p className="data-mono text-center text-xs text-muted-foreground">
            {displayPhone(order.customer.normalizedPhone)} · charge{' '}
            {displayMoney(order.deliveryCharge, order.currency)}
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
                Picked up from {order.vendor.businessName}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setReason('');
                  setReasonDialog('release');
                }}
                className="w-full cursor-pointer py-1 text-center text-sm text-muted-foreground hover:text-foreground"
              >
                Can&apos;t take this one? Release it
              </button>
            </>
          ) : (
            <>
              <Button variant="live" size="touch" onClick={() => setConfirmDeliver(true)}>
                Delivered to customer
              </Button>
              <button
                type="button"
                onClick={() => {
                  setReason('');
                  setReasonDialog('fail');
                }}
                className="w-full cursor-pointer py-1 text-center text-sm text-muted-foreground hover:text-destructive"
              >
                Couldn&apos;t deliver? Mark as failed
              </button>
            </>
          )}
        </div>
      )}

      <Dialog open={confirmDeliver} onOpenChange={setConfirmDeliver}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm delivery</DialogTitle>
            <DialogDescription>
              Package handed to {order.customer.name}
              {order.driverEarnings
                ? ` — ${displayMoney(order.driverEarnings, order.currency)} added to your earnings.`
                : '.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDeliver(false)}>
              Not yet
            </Button>
            <Button
              variant="live"
              loading={deliverOrder.isPending}
              onClick={() => {
                setConfirmDeliver(false);
                void act('deliver');
              }}
            >
              Yes, delivered
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reasonDialog !== null} onOpenChange={(open) => !open && setReasonDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reasonDialog === 'release' ? 'Release this order?' : 'Mark as failed?'}
            </DialogTitle>
            <DialogDescription>
              {reasonDialog === 'release'
                ? 'It goes back to the feed for other drivers. Your earnings for it are removed.'
                : 'Use this when the customer is unreachable or refused the delivery.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonDialog === 'release' ? 'e.g. Bike problem' : 'e.g. Customer unreachable'}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReasonDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={reasonDialog === 'fail' ? 'destructive' : 'default'}
              loading={releaseOrder.isPending || failOrder.isPending}
              onClick={() => void submitReason()}
            >
              Confirm
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
