'use client';

import { Pencil, Plus, Search, Store, Trash2 } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconAction } from '@/components/ui/icon-action';
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
import { Pagination } from '@/components/pagination';
import { displayDate, fileUrl } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useUrlState } from '@/lib/use-url-state';
import { ListError } from '@/components/list-error';
import { useVendors, type AdminVendor } from '@/features/admin/vendors/api';
import { VendorFormDialog } from '@/features/admin/vendors/vendor-form-dialog';
import { VendorDeleteDialog } from '@/features/admin/vendors/vendor-delete-dialog';

const DEFAULTS = { page: '1', q: '' };

export default function AdminVendorsPage() {
  // useSearchParams needs a Suspense boundary on a statically rendered route.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <AdminVendorsView />
    </Suspense>
  );
}

function AdminVendorsView() {
  // Filters and page live in the URL so a refresh keeps them and the view can
  // be linked. useUrlState also resets the page whenever the search changes.
  const [urlState, setUrlState] = useUrlState(DEFAULTS);
  const page = Number(urlState.page) || 1;
  const setPage = (p: number) => setUrlState({ page: String(p) });
  // Local so typing stays instant; the URL follows the debounced value.
  const [search, setSearch] = useState(urlState.q);
  const q = useDebouncedValue(search, 300);
  useEffect(() => {
    if (q !== urlState.q) setUrlState({ q });
  }, [q, urlState.q, setUrlState]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AdminVendor | null>(null);
  const [deleting, setDeleting] = useState<AdminVendor | null>(null);

  const { data, isPending, isError, refetch } = useVendors(page, q);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(vendor: AdminVendor) {
    setEditing(vendor);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Vendors</h1>
          <p className="text-sm text-muted-foreground">Businesses that create delivery orders.</p>
        </div>
        <Button onClick={openCreate}>
          <Plus /> New vendor
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or email"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isError ? (
        <ListError what="vendors" onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : data && data.data.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Login email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((vendor) => (
                <TableRow key={vendor.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {vendor.logoKey ? (
                        <img
                          src={fileUrl(vendor.logoKey)}
                          alt=""
                          className="size-9 rounded-md border object-cover"
                        />
                      ) : (
                        <div className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <Store className="size-4" />
                        </div>
                      )}
                      <span className="font-medium">{vendor.businessName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{vendor.user.email}</TableCell>
                  <TableCell>
                    <Badge variant={vendor.status === 'ACTIVE' ? 'success' : 'destructive'}>
                      {vendor.status === 'ACTIVE' ? 'Active' : 'Suspended'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{displayDate(vendor.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <IconAction label="Edit" icon={Pencil} onClick={() => openEdit(vendor)} />
                      <IconAction
                        label="Delete"
                        icon={Trash2}
                        tone="destructive"
                        onClick={() => setDeleting(vendor)}
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
          <Store className="size-8 text-muted-foreground" />
          <div>
            <p className="font-medium">{q ? 'No vendors match your search' : 'No vendors yet'}</p>
            <p className="text-sm text-muted-foreground">
              {q ? 'Try a different name or phone number.' : 'Create the first vendor to get started.'}
            </p>
          </div>
          {!q && (
            <Button onClick={openCreate}>
              <Plus /> New vendor
            </Button>
          )}
        </div>
      )}

      <VendorFormDialog open={dialogOpen} onOpenChange={setDialogOpen} vendor={editing} />
      <VendorDeleteDialog vendor={deleting} onOpenChange={(o) => !o && setDeleting(null)} />
    </div>
  );
}
