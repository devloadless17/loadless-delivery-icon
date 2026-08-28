'use client';

import { ORDER_STATUSES, type OrderStatus } from '@loadless/shared';
import { Download, PackageSearch } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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

export default function AdminOrdersPage() {
  const [status, setStatus] = useState<OrderStatus | 'ALL'>('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const filters: AdminOrderFilters = {
    ...(status !== 'ALL' ? { status } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
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
          <Input id="ao-from" type="date" className="h-10 w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ao-to">To</Label>
          <Input id="ao-to" type="date" className="h-10 w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
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
