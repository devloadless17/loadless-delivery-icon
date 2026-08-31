'use client';

import { ArrowLeft, Phone, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { displayDateTime, displayMoney, displayPhone } from '@/lib/format';
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
import { stashOrderDraft } from '@/features/orders/order-draft';
import { displayAddress, fromMinorUnits } from '@loadless/shared';
import { OrderStatusBadge } from '@/features/orders/order-status';
import { OrderTimeline } from '@/features/orders/order-timeline';

export default function VendorOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: order, isPending } = useVendorOrder(id);
  const cancelOrder = useCancelOrder();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  async function confirmCancel() {
    if (reason.trim().length < 3) {
      toast.error('Give a short reason for the cancellation.');
      return;
    }
    try {
      await cancelOrder.mutateAsync({ id, reason: reason.trim() });
      toast.success('Order cancelled');
      setCancelOpen(false);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Could not cancel the order.',
      );
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
          aria-label="Back to orders"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex flex-1 items-center justify-between gap-3">
          <h1 className="data-mono text-xl font-semibold">{order.orderNumber}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Delivery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{order.customer.name}</p>
              <a
                href={`tel:${order.customer.normalizedPhone}`}
                className="data-mono text-sm text-primary hover:underline"
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
            <CardTitle className="text-base">Driver</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm font-medium">{order.driver.fullName}</p>
            <a href={`tel:${order.driver.contactPhone}`}>
              <Button variant="outline" size="sm">
                <Phone /> <span className="data-mono">{displayPhone(order.driver.contactPhone)}</span>
              </Button>
            </a>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderTimeline entries={order.statusHistory ?? []} />
          <p className="mt-3 text-xs text-muted-foreground">Created {displayDateTime(order.createdAt)}</p>
        </CardContent>
      </Card>

      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          stashOrderDraft({
            customerPhone: order.customer.normalizedPhone,
            addressText: order.deliveryAddressText ?? '',
            mapsUrl: order.deliveryMapsUrl,
            charge: fromMinorUnits(order.deliveryCharge, order.currency),
            currency: order.currency,
            deliveryInstructions: order.deliveryInstructions,
            sourceOrderNumber: order.orderNumber,
          });
          router.push(
            `/vendor/orders/new?repeat=1&phone=${encodeURIComponent(order.customer.normalizedPhone)}`,
          );
        }}
      >
        <RotateCcw /> Repeat this order
      </Button>

      {order.status === 'PENDING' && (
        <Button variant="destructive" className="w-full" onClick={() => setCancelOpen(true)}>
          Cancel order
        </Button>
      )}
      {order.status === 'DRIVER_ASSIGNED' || order.status === 'PICKED_UP' ? (
        <p className="text-center text-xs text-muted-foreground">
          A driver has this order — contact the platform if it must be cancelled.
        </p>
      ) : null}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this order?</DialogTitle>
            <DialogDescription>
              This only works while no driver has accepted it. The order stays in your history as
              cancelled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Reason</Label>
            <Input
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer changed their mind"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Keep order
            </Button>
            <Button variant="destructive" loading={cancelOrder.isPending} onClick={() => void confirmCancel()}>
              Cancel order
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
