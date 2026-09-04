'use client';

import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal, Trash2, UserPlus, Users } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pagination, type PageMeta } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { IconAction } from '@/components/ui/icon-action';
import { useVendor, useVendors } from '@/features/admin/vendors/api';
import { EntityPicker, type PickerOption } from '@/components/ui/entity-picker';
import { ListError } from '@/components/list-error';
import { useUrlState } from '@/lib/use-url-state';
import { CustomerManageDialog } from '@/features/admin/customers/manage-dialog';
import { CustomerDeleteDialog } from '@/features/admin/customers/customer-delete-dialog';
import { CustomerCreateDialog } from '@/features/customers/customer-create-dialog';
import { displayDate, displayPhone } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';

interface AdminCustomer {
  id: string;
  normalizedPhone: string;
  name: string;
  createdAt: string;
  createdByVendor: { businessName: string } | null;
  /** vendorLinks = how many vendors actually deal with this customer. */
  _count: { orders: number; addresses: number; vendorLinks: number };
}

function useAdminCustomers(page: number, q: string, vendorId: string) {
  return useQuery({
    queryKey: ['admin', 'customers', page, q, vendorId],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (q) params.set('q', q);
      if (vendorId !== 'ALL') params.set('vendorId', vendorId);
      return api.page<AdminCustomer[], PageMeta>(`/admin/customers?${params}`, signal);
    },
    placeholderData: (prev) => prev,
  });
}

const DEFAULTS = { page: '1', q: '', vendorId: 'ALL' };

export default function AdminCustomersPage() {
  // useSearchParams needs a Suspense boundary on a statically rendered route.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AdminCustomersView />
    </Suspense>
  );
}

function AdminCustomersView() {
  const [urlState, setUrlState] = useUrlState(DEFAULTS);
  const page = Number(urlState.page) || 1;
  const { vendorId } = urlState;
  const setPage = (p: number) => setUrlState({ page: String(p) });

  // The box keeps its own state so typing stays instant; the URL follows the
  // debounced value, so the address bar does not churn on every keystroke.
  const [search, setSearch] = useState(urlState.q);
  const q = useDebouncedValue(search, 300);
  useEffect(() => {
    if (q !== urlState.q) setUrlState({ q });
  }, [q, urlState.q, setUrlState]);

  const [managingId, setManagingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminCustomer | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isPending, isError, refetch } = useAdminCustomers(page, q, vendorId);

  const [vendorQuery, setVendorQuery] = useState('');
  const [pickedVendor, setPickedVendor] = useState<PickerOption | null>(null);
  const vendors = useVendors(1, useDebouncedValue(vendorQuery, 250));
  const vendorLabel = useVendor(vendorId !== 'ALL' && !pickedVendor ? vendorId : null);
  const vendorOptions: PickerOption[] = (vendors.data?.data ?? []).map((v) => ({
    id: v.id,
    label: v.businessName,
  }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">
            The shared customer directory — one record per phone number, reused by every vendor.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus /> New customer
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-52">
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

      {isError ? (
        <ListError what="customers" onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : data && data.data.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Addresses</TableHead>
                <TableHead>Vendors</TableHead>
                <TableHead>Added by</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                      {/* A real <button> inside the cell, never role="button" on
                        the <TableRow> — that replaces the row role and breaks
                        every getByRole('row') in the suite. */}
                    <button
                      type="button"
                      className="rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setManagingId(customer.id)}
                    >
                      {customer.name}
                    </button>
                </TableCell>
                  <TableCell className="data-mono">{displayPhone(customer.normalizedPhone)}</TableCell>
                  <TableCell className="data-mono">{customer._count.orders}</TableCell>
                  <TableCell className="data-mono">{customer._count.addresses}</TableCell>
                  <TableCell className="data-mono">{customer._count.vendorLinks}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.createdByVendor?.businessName ?? 'Admin'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{displayDate(customer.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <IconAction
                        label="Manage"
                        icon={SlidersHorizontal}
                        onClick={() => setManagingId(customer.id)}
                      />
                      <IconAction
                        label="Delete"
                        icon={Trash2}
                        tone="destructive"
                        onClick={() => setDeleting(customer)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination meta={data.meta} onPageChange={setPage} />
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <Users className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{q ? 'No customers match your search' : 'No customers yet'}</p>
          <p className="text-sm text-muted-foreground">
            Vendors create customers during order entry — or add one here.
          </p>
        </div>
      )}
      <CustomerManageDialog
        customerId={managingId}
        onOpenChange={(open) => !open && setManagingId(null)}
      />
      <CustomerDeleteDialog
        customer={deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
      <CustomerCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(customer) => setManagingId(customer.id)}
      />
    </div>
  );
}
