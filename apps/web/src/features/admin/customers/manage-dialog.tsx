'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
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
import { MapsLinkField } from '@/components/maps-link';
import { Skeleton } from '@/components/ui/skeleton';
import type { Customer } from '@/features/customers/api';

function useAdminCustomer(id: string | null) {
  return useQuery({
    queryKey: ['admin', 'customers', 'detail', id],
    queryFn: () => api.get<Customer>(`/admin/customers/${id}`),
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
  const [addingAddress, setAddingAddress] = useState(false);
  const [addressText, setAddressText] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');

  useEffect(() => {
    if (customer) {
      setName(customer.name);
      setPhone(displayPhone(customer.normalizedPhone));
      setAddingAddress(false);
    }
  }, [customer]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
    void qc.invalidateQueries({ queryKey: ['customers'] });
  };

  const saveIdentity = useMutation({
    mutationFn: () =>
      api.patch<Customer>(`/admin/customers/${customerId}`, {
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

  const addAddress = useMutation({
    mutationFn: () =>
      api.post(`/customers/${customerId}/addresses`, {
        label: 'OTHER',
        addressText: addressText.trim(),
        ...(mapsUrl.trim() ? { mapsUrl: mapsUrl.trim() } : {}),
      }),
    onSuccess: () => {
      invalidate();
      setAddressText('');
      setMapsUrl('');
      setAddingAddress(false);
      toast.success('Address saved');
    },
    onError: () => toast.error('Could not save the address.'),
  });

  const archiveAddress = useMutation({
    mutationFn: (addressId: string) =>
      api.post<void>(`/customers/${customerId}/addresses/${addressId}/archive`),
    onSuccess: invalidate,
    onError: () => toast.error('Could not remove the address.'),
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
              {customer.addresses.length === 0 ? (
                <p className="text-sm text-muted-foreground">None yet.</p>
              ) : (
                <ul className="space-y-2">
                  {customer.addresses.map((address) => (
                    <li
                      key={address.id}
                      className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
                    >
                      <div className="min-w-0 text-sm">
                        <p>{address.addressText}</p>
                        {address.mapsUrl && (
                          <a
                            href={address.mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <ExternalLink className="size-3" aria-hidden /> Open in Google Maps
                          </a>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label="Remove address"
                        onClick={() => archiveAddress.mutate(address.id)}
                        className="cursor-pointer text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {addingAddress ? (
                <form
                  className="space-y-3 rounded-md border border-dashed p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (addressText.trim().length < 3) {
                      toast.error('Enter an address first.');
                      return;
                    }
                    addAddress.mutate();
                  }}
                >
                  <div className="space-y-2">
                    <Label htmlFor="mc-address">Address</Label>
                    <Input
                      id="mc-address"
                      value={addressText}
                      onChange={(e) => setAddressText(e.target.value)}
                      placeholder="Street, building, floor"
                      autoFocus
                    />
                  </div>
                  <MapsLinkField id="mc-maps" value={mapsUrl} onChange={setMapsUrl} />
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAddingAddress(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" loading={addAddress.isPending}>
                      Save address
                    </Button>
                  </div>
                </form>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setAddingAddress(true)}>
                  <Plus /> Add address
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
