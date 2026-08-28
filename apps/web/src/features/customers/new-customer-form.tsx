'use client';

import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { displayPhone } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapsLinkField } from '@/components/maps-link';
import { useCreateCustomer } from './api';

/** Shown when a valid phone has no match — creates the global customer inline. */
export function NewCustomerForm({ normalizedPhone }: { normalizedPhone: string }) {
  const [name, setName] = useState('');
  const [addressText, setAddressText] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const createCustomer = useCreateCustomer();

  async function submit() {
    if (name.trim().length < 2) {
      toast.error('Enter the customer’s name.');
      return;
    }
    try {
      await createCustomer.mutateAsync({
        phone: normalizedPhone,
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
      toast.success('Customer created');
      setName('');
      setAddressText('');
      setMapsUrl('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create the customer.');
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="size-4 text-primary" aria-hidden />
          New customer
        </CardTitle>
        <CardDescription>
          <span className="data-mono">{displayPhone(normalizedPhone)}</span> isn&apos;t on the
          platform yet. Add them once — every vendor can then find them by phone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="nc-name">Name</Label>
            <Input
              id="nc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nc-address">Address (optional)</Label>
            <Input
              id="nc-address"
              value={addressText}
              onChange={(e) => setAddressText(e.target.value)}
              placeholder="Street, building, floor"
            />
          </div>
          {addressText.trim().length >= 3 && (
            <MapsLinkField id="nc-maps" value={mapsUrl} onChange={setMapsUrl} />
          )}
          <Button type="submit" loading={createCustomer.isPending}>
            Create customer
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
