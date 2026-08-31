'use client';

import { normalizeLebanesePhone } from '@loadless/shared';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { MapsLinkField } from '@/components/maps-link';
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
import { useCreateCustomer, type CustomerProfile } from './api';

/**
 * Explicit customer creation, for both the vendor and admin pages. Customers
 * used to appear only as a side effect of order entry, which meant a vendor
 * taking details ahead of an order had nowhere to put them.
 */
export function CustomerCreateDialog({
  open,
  onOpenChange,
  initialPhone = '',
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPhone?: string;
  onCreated: (customer: CustomerProfile, created: boolean) => void;
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState('');
  const [addressText, setAddressText] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const createCustomer = useCreateCustomer();

  useEffect(() => {
    if (open) {
      setPhone(initialPhone);
      setName('');
      setAddressText('');
      setMapsUrl('');
      setPhoneError(null);
    }
  }, [open, initialPhone]);

  async function submit() {
    const normalized = normalizeLebanesePhone(phone);
    if (!normalized) {
      setPhoneError('Enter a valid Lebanese phone number');
      return;
    }
    if (name.trim().length < 2) {
      toast.error('Enter the customer’s name.');
      return;
    }
    try {
      const result = await createCustomer.mutateAsync({
        phone: normalized,
        name: name.trim(),
        ...(addressText.trim().length >= 3
          ? {
              address: {
                label: 'HOME' as const,
                addressText: addressText.trim(),
                ...(mapsUrl.trim() ? { mapsUrl: mapsUrl.trim() } : {}),
              },
            }
          : {}),
      });
      onOpenChange(false);
      onCreated(result.customer, result.created);
      toast.success(
        result.created ? 'Customer created' : 'That number already exists — opening their profile.',
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create the customer.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>
            Added once and shared across the whole platform — any vendor can then find them by
            phone.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="cc-phone">Phone number</Label>
            <Input
              id="cc-phone"
              type="tel"
              inputMode="tel"
              className="data-mono"
              placeholder="03 123 456"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneError(null);
              }}
              onBlur={() => {
                if (phone && !normalizeLebanesePhone(phone)) {
                  setPhoneError('Enter a valid Lebanese phone number');
                }
              }}
              aria-invalid={!!phoneError}
              autoFocus
            />
            {phoneError && <p className="text-sm text-destructive">{phoneError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cc-name">Name</Label>
            <Input
              id="cc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cc-address">Address (optional)</Label>
            <Input
              id="cc-address"
              value={addressText}
              onChange={(e) => setAddressText(e.target.value)}
              placeholder="Street, building, floor"
            />
          </div>
          {addressText.trim().length >= 3 && (
            <MapsLinkField id="cc-maps" value={mapsUrl} onChange={setMapsUrl} />
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createCustomer.isPending}>
              Create customer
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
