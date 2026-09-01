'use client';

import { CURRENCIES, ORDER_STATUSES, type Currency, type OrderStatus } from '@loadless/shared';
import { Download, PackageSearch, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { displayDateTime, displayMoney } from '@/lib/format';
import {
  buildAdminOrderParams,
  useAdminOrders,
  type AdminOrderFilters,
} from '@/features/admin/orders/api';
import { OrderStatusBadge, STATUS_META } from '@/features/orders/order-status';
import { useVendors } from '@/features/admin/vendors/api';
import { useDrivers } from '@/features/admin/drivers/api';

export default function AdminOrdersPage() {
  const [status, setStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [vendorId, setVendorId] = useState('ALL');
  const [driverId, setDriverId] = useState('ALL');
  const [currency, setCurrency] = useState<Currency | 'ALL'>('ALL');

  // The lists that fill the two pickers. Page 1 is enough for a platform of
  // this size, and asking for more would slow the screen for nobody's benefit.
  const vendors = useVendors(1, '');
  const drivers = useDrivers(1, '');

  const filters: AdminOrderFilters = {
    ...(status !== 'ALL' ? { status } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(vendorId !== 'ALL' ? { vendorId } : {}),
    ...(driverId !== 'ALL' ? { driverId } : {}),
    ...(currency !== 'ALL' ? { currency } : {}),
  };
  const anyFilter =
    status !== 'ALL' ||
    from !== '' ||
    to !== '' ||
    vendorId !== 'ALL' ||
    driverId !== 'ALL' ||
    currency !== 'ALL';

  function clearFilters() {
    setStatus('ALL');
    setFrom('');
    setTo('');
    setVendorId('ALL');
    setDriverId('ALL');
    setCurrency('ALL');
  }
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAdminOrders(filters);
  const orders = data?.pages.flatMap((p) => p.data) ?? [];

  const csvUrl = `/api/v1/admin/analytics/orders.csv?${buildAdminOrderParams(filters)}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-muted-foreground">Every order on the platform, live.</p>
        </div>
        <a href={csvUrl} download>
          <Button variant="outline">
            <Download /> Export CSV
          </Button>
        </a>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus | 'ALL')}>
            <SelectTrigger className="h-10 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_META[s].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ao-from">From</Label>
          <DateField id="ao-from" className="w-44" value={from} onValueChange={setFrom} clearLabel="from date" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ao-to">To</Label>
          <DateField id="ao-to" className="w-44" value={to} onValueChange={setTo} clearLabel="to date" />
        </div>
        {/* The platform view: the API has accepted these three all along — only
            the screen was missing them, so "show me this shop's week" meant
            reading the whole board. */}
        <div className="space-y-1.5">
          <Label>Vendor</Label>
          <Select value={vendorId} onValueChange={setVendorId}>
            <SelectTrigger className="h-10 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All vendors</SelectItem>
              {(vendors.data?.data ?? []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.businessName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Driver</Label>
          <Select value={driverId} onValueChange={setDriverId}>
            <SelectTrigger className="h-10 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All drivers</SelectItem>
              {(drivers.data?.data ?? []).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Select value={currency} onValueChange={(v) => setCurrency(v as Currency | 'ALL')}>
            <SelectTrigger className="h-10 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Any</SelectItem>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {anyFilter && (
          <Button variant="ghost" className="h-10" onClick={clearFilters}>
            <X /> Clear filters
          </Button>
        )}
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : orders.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Charge</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="data-mono font-semibold text-primary hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell>{order.vendor.businessName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {order.driver?.fullName ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{order.customer.name}</TableCell>
                  <TableCell className="data-mono text-right">
                    {displayMoney(order.deliveryCharge, order.currency)}
                  </TableCell>
                  <TableCell className="data-mono text-right text-muted-foreground">
                    {order.platformCommissionAmount
                      ? displayMoney(order.platformCommissionAmount, order.currency)
                      : '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {displayDateTime(order.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {hasNextPage && (
            <div className="flex justify-center">
              <Button variant="outline" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <PackageSearch className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">No orders match these filters</p>
        </div>
      )}
    </div>
  );
}
