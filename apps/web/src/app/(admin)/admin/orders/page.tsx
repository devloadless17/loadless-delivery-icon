'use client';

import { CURRENCIES, ORDER_STATUSES, type Currency, type OrderStatus } from '@loadless/shared';
import { Download, PackageSearch, X } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useState } from 'react';
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
import { displayDateTime, displayMoney, displayPhone } from '@/lib/format';
import {
  buildAdminOrderParams,
  useAdminOrders,
  type AdminOrderFilters,
} from '@/features/admin/orders/api';
import { OrderStatusBadge, STATUS_META } from '@/features/orders/order-status';
import { useVendor, useVendors } from '@/features/admin/vendors/api';
import { useDriver, useDrivers } from '@/features/admin/drivers/api';
import { EntityPicker, type PickerOption } from '@/components/ui/entity-picker';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useUrlState } from '@/lib/use-url-state';
import { ListError } from '@/components/list-error';
import { api, ApiError } from '@/lib/api-client';
import { toast } from 'sonner';

const FILTER_DEFAULTS = {
  status: 'ALL',
  from: '',
  to: '',
  vendorId: 'ALL',
  driverId: 'ALL',
  currency: 'ALL',
};

export default function AdminOrdersPage() {
  // useSearchParams needs a Suspense boundary on a statically rendered route.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AdminOrdersView />
    </Suspense>
  );
}

function AdminOrdersView() {
  // The filters live in the URL, so a refresh keeps them and the view can be
  // sent to someone. A driver's detail dialog deep-links here with ?driverId=
  // and now simply works, instead of needing a read-once-then-strip dance.
  const [urlState, setUrlState] = useUrlState(FILTER_DEFAULTS);
  const { from, to } = urlState;
  const status = urlState.status as OrderStatus | 'ALL';
  const currency = urlState.currency as Currency | 'ALL';
  const { vendorId, driverId } = urlState;

  const setStatus = (v: OrderStatus | 'ALL') => setUrlState({ status: v });
  const setFrom = (v: string) => setUrlState({ from: v });
  const setTo = (v: string) => setUrlState({ to: v });
  const setCurrency = (v: Currency | 'ALL') => setUrlState({ currency: v });

  // Searched server-side, not listed. These were page 1 at limit 20 of a
  // newest-first list, so older vendors and drivers silently dropped out of the
  // filter with nothing on screen admitting it.
  const [vendorQuery, setVendorQuery] = useState('');
  const [driverQuery, setDriverQuery] = useState('');
  const [pickedVendor, setPickedVendor] = useState<PickerOption | null>(null);
  const [pickedDriver, setPickedDriver] = useState<PickerOption | null>(null);
  const vendors = useVendors(1, useDebouncedValue(vendorQuery, 250));
  const drivers = useDrivers(1, useDebouncedValue(driverQuery, 250));

  // A filter restored from the URL has an id but no name yet.
  const vendorLabel = useVendor(vendorId !== 'ALL' && !pickedVendor ? vendorId : null);
  const driverLabel = useDriver(driverId !== 'ALL' && !pickedDriver ? driverId : null);

  const vendorOptions: PickerOption[] = (vendors.data?.data ?? []).map((v) => ({
    id: v.id,
    label: v.businessName,
  }));
  const driverOptions: PickerOption[] = (drivers.data?.data ?? []).map((d) => ({
    id: d.id,
    label: d.fullName,
    hint: displayPhone(d.contactPhone),
  }));

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
    setUrlState(FILTER_DEFAULTS);
    setPickedVendor(null);
    setPickedDriver(null);
    setVendorQuery('');
    setDriverQuery('');
  }
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAdminOrders(filters);
  const orders = data?.pages.flatMap((p) => p.data) ?? [];

  // Through api.download, not a bare <a download>: a browser navigation skips
  // the silent 401 refresh, so on a page open longer than the 15-minute access
  // token the admin was handed a file named orders-….csv containing a JSON
  // error — a broken report with a convincing name.
  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    try {
      await api.download(
        `/admin/analytics/orders.csv?${buildAdminOrderParams(filters)}`,
        `orders-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not export those orders');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-muted-foreground">Every order on the platform, live.</p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={exporting}>
          <Download /> {exporting ? 'Exporting…' : 'Export CSV'}
        </Button>
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
          <div className="w-48">
            <EntityPicker
              value={vendorId === 'ALL' ? '' : vendorId}
              selectedLabel={pickedVendor?.label ?? vendorLabel.data?.businessName}
              onSelect={(option) => {
                setPickedVendor(option);
                setUrlState({ vendorId: option?.id ?? 'ALL' });
              }}
              query={vendorQuery}
              onQueryChange={setVendorQuery}
              options={vendorOptions}
              isPending={vendors.isPending}
              hasMore={(vendors.data?.meta.total ?? 0) > vendorOptions.length}
              placeholder="All vendors"
              clearLabel="All vendors"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Driver</Label>
          <div className="w-48">
            <EntityPicker
              value={driverId === 'ALL' ? '' : driverId}
              selectedLabel={pickedDriver?.label ?? driverLabel.data?.fullName}
              onSelect={(option) => {
                setPickedDriver(option);
                setUrlState({ driverId: option?.id ?? 'ALL' });
              }}
              query={driverQuery}
              onQueryChange={setDriverQuery}
              options={driverOptions}
              isPending={drivers.isPending}
              hasMore={(drivers.data?.meta.total ?? 0) > driverOptions.length}
              placeholder="All drivers"
              clearLabel="All drivers"
            />
          </div>
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

      {isError ? (
        <ListError what="orders" onRetry={() => void refetch()} />
      ) : isPending ? (
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
                      className="data-mono font-semibold text-primary-strong hover:underline"
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
