'use client';

import { displayAddress, formatBps } from '@loadless/shared';
import { ArrowLeft, UserCog, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDrivers } from '@/features/admin/drivers/api';
import {
  useAdminAssignOrder,
  useAdminCancelOrder,
  useAdminOrder,
  useAdminReassignOrder,
} from '@/features/admin/orders/api';
import { OrderStatusBadge } from '@/features/orders/order-status';
import { OrderTimeline } from '@/features/orders/order-timeline';

export default function AdminOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: order, isPending, refetch } = useAdminOrder(id);
  const cancelOrder = useAdminCancelOrder();
  const assignOrder = useAdminAssignOrder();
  const reassignOrder = useAdminReassignOrder();
  const { data: driversPage } = useDrivers(1, '');

  const [dialog, setDialog] = useState<'cancel' | 'assign' | 'reassign' | null>(null);
  const [reason, setReason] = useState('');
  const [driverId, setDriverId] = useState('');

  if (isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!order) return null;

  const drivers = driversPage?.data.filter((d) => d.status === 'ACTIVE') ?? [];
  const isOpen = ['PENDING', 'DRIVER_ASSIGNED', 'PICKED_UP'].includes(order.status);

  async function runAction() {
    try {
      if (dialog === 'cancel') {
        if (reason.trim().length < 3) return toast.error('A reason is required.');
        await cancelOrder.mutateAsync({ id, reason: reason.trim() });
        toast.success('Order cancelled');
      } else if (dialog === 'assign') {
        if (!driverId) return toast.error('Pick a driver.');
        await assignOrder.mutateAsync({ id, driverId });
        toast.success('Driver assigned');
      } else if (dialog === 'reassign') {
        if (!driverId) return toast.error('Pick a driver.');
        if (reason.trim().length < 3) return toast.error('A reason is required.');
        await reassignOrder.mutateAsync({ id, driverId, reason: reason.trim() });
        toast.success('Order reassigned — the split was recomputed for the new driver');
      }
      setDialog(null);
      void refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed — check the order state.');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/orders"
          aria-label="Back to orders"
          className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <h1 className="data-mono flex-1 text-xl font-semibold">{order.orderNumber}</h1>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Parties</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Vendor</p>
              <p className="font-medium">{order.vendor.businessName}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
              <p className="font-medium">{order.customer.name}</p>
              <p className="data-mono text-muted-foreground">
                {displayPhone(order.customer.normalizedPhone)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Driver</p>
              {order.driver ? (
                <>
                  <p className="font-medium">{order.driver.fullName}</p>
                  <p className="data-mono text-muted-foreground">
                    {displayPhone(order.driver.contactPhone)}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">Not assigned</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Financials</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery charge</span>
              <span className="data-mono font-semibold">
                {displayMoney(order.deliveryCharge, order.currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Commission {order.commissionBps !== null ? `(${formatBps(order.commissionBps)})` : ''}
              </span>
              <span className="data-mono font-semibold">
                {order.platformCommissionAmount
                  ? displayMoney(order.platformCommissionAmount, order.currency)
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between border-t pt-2">
              <span className="text-muted-foreground">Driver earnings</span>
              <span className="data-mono font-semibold text-accent">
                {order.driverEarnings ? displayMoney(order.driverEarnings, order.currency) : '—'}
              </span>
            </div>
            <p className="pt-1 text-xs text-muted-foreground">
              The split was locked when the driver accepted; later rate changes never touch it.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Delivery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>{displayAddress(order.deliveryAddressText, order.deliveryMapsUrl)}</p>
          {order.deliveryInstructions && (
            <p className="text-muted-foreground">“{order.deliveryInstructions}”</p>
          )}
          {order.notes && <p className="text-muted-foreground">Vendor note: {order.notes}</p>}
          {order.deliveryMapsUrl && <MapsLinkButton url={order.deliveryMapsUrl} size="sm" />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderTimeline entries={order.statusHistory} />
          <p className="mt-3 text-xs text-muted-foreground">Created {displayDateTime(order.createdAt)}</p>
        </CardContent>
      </Card>

      {isOpen && (
        <div className="flex flex-wrap gap-2">
          {order.status === 'PENDING' && (
            <Button onClick={() => { setDriverId(''); setDialog('assign'); }}>
              <UserCog /> Assign driver
            </Button>
          )}
          {(order.status === 'DRIVER_ASSIGNED' || order.status === 'PICKED_UP') && (
            <Button variant="outline" onClick={() => { setDriverId(''); setReason(''); setDialog('reassign'); }}>
              <UserCog /> Reassign driver
            </Button>
          )}
          <Button variant="destructive" onClick={() => { setReason(''); setDialog('cancel'); }}>
            <XCircle /> Cancel order
          </Button>
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === 'cancel' ? 'Cancel this order?' : dialog === 'assign' ? 'Assign a driver' : 'Reassign the order'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'cancel'
                ? 'Works at any stage before delivery. The driver and vendor are notified instantly.'
                : dialog === 'assign'
                  ? 'Manually hand this pending order to a driver — duty status is bypassed.'
                  : 'The financial split is recomputed at the new driver’s commission rate.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {(dialog === 'assign' || dialog === 'reassign') && (
              <div className="space-y-2">
                <Label>Driver</Label>
                <Select value={driverId} onValueChange={setDriverId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a driver" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers
                      .filter((d) => d.id !== order.driver?.id)
                      .map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.fullName} · {d.dutyStatus === 'ON_DUTY' ? 'on duty' : 'off duty'}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(dialog === 'cancel' || dialog === 'reassign') && (
              <div className="space-y-2">
                <Label htmlFor="admin-reason">Reason</Label>
                <Input
                  id="admin-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Recorded in the order history"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Close
              </Button>
              <Button
                variant={dialog === 'cancel' ? 'destructive' : 'default'}
                loading={cancelOrder.isPending || assignOrder.isPending || reassignOrder.isPending}
                onClick={() => void runAction()}
              >
                Confirm
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
