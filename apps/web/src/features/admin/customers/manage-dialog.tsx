'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
import { displayPhone } from '@/lib/format';
import { Button } from '@/components/ui/button';
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
import { AddressManager } from '@/features/customers/addresses/address-manager';
import type { CustomerProfile } from '@/features/customers/api';

function useAdminCustomer(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'customers', 'detail', id],
    queryFn: () => api.get<CustomerProfile>(`/admin/customers/${id}`),
    enabled: id !== null,
  });
}

/**
 * Full admin control over a shared customer: identity (name + phone — phone is
 * admin-only across the whole platform), and the saved address book.
 */
export function CustomerManageDialog({
  customerId,
  onOpenChange,
}: {
  customerId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: customer, isPending } = useAdminCustomer(customerId);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (customer) {
      setName(customer.name);
      setPhone(displayPhone(customer.normalizedPhone));
    }
  }, [customer]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
    void qc.invalidateQueries({ queryKey: ['customers'] });
  };

  const saveIdentity = useMutation({
    mutationFn: () =>
      api.patch<CustomerProfile>(`/admin/customers/${customerId}`, {
        name: name.trim(),
        phone: phone.trim(),
      }),
    onSuccess: () => {
      invalidate();
      toast.success('Customer updated');
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : 'Could not save the customer.'),
  });

  return (
    <Dialog open={customerId !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage customer</DialogTitle>
          <DialogDescription>
            Changes apply platform-wide — every vendor sees this record. Only admins can change
            the phone number (it is the customer&apos;s identity).
          </DialogDescription>
        </DialogHeader>

        {isPending || !customer ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <div className="space-y-5">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                saveIdentity.mutate();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mc-name">Name</Label>
                  <Input id="mc-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mc-phone">Phone (identity)</Label>
                  <Input
                    id="mc-phone"
                    type="tel"
                    className="data-mono"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
              <Button type="submit" size="sm" loading={saveIdentity.isPending}>
                Save identity
              </Button>
            </form>

            <div className="space-y-2">
              <p className="text-sm font-medium">Saved addresses</p>
              <AddressManager customerId={customer.id} addresses={customer.addresses} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
