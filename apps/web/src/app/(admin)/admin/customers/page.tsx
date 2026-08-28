'use client';

import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { useState } from 'react';
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
import { CustomerManageDialog } from '@/features/admin/customers/manage-dialog';
import { displayDate, displayPhone } from '@/lib/format';
import { useDebouncedValue } from '@/lib/use-debounced-value';

interface AdminCustomer {
  id: string;
  normalizedPhone: string;
  name: string;
  createdAt: string;
  createdByVendor: { businessName: string } | null;
  _count: { orders: number; addresses: number };
}

function useAdminCustomers(page: number, q: string) {
  return useQuery({
    queryKey: ['admin', 'customers', page, q],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (q) params.set('q', q);
      const res = await fetch(`/api/v1/admin/customers?${params}`);
      if (!res.ok) throw new Error('Failed to load customers');
      return (await res.json()) as { data: AdminCustomer[]; meta: PageMeta };
    },
    placeholderData: (prev) => prev,
  });
}

export default function AdminCustomersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [managingId, setManagingId] = useState<string | null>(null);
  const q = useDebouncedValue(search, 300);
  const { data, isPending } = useAdminCustomers(page, q);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-sm text-muted-foreground">
          The shared customer directory — one record per phone number, reused by every vendor.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or phone"
          className="pl-9"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {isPending ? (
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
                <TableHead>Added by</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell className="data-mono">{displayPhone(customer.normalizedPhone)}</TableCell>
                  <TableCell className="data-mono">{customer._count.orders}</TableCell>
                  <TableCell className="data-mono">{customer._count.addresses}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.createdByVendor?.businessName ?? 'Admin'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{displayDate(customer.createdAt)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setManagingId(customer.id)}>
                      Manage
                    </Button>
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
            Customers are created by vendors during order entry.
          </p>
        </div>
      )}
      <CustomerManageDialog
        customerId={managingId}
        onOpenChange={(open) => !open && setManagingId(null)}
      />
    </div>
  );
}
