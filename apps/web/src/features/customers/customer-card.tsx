'use client';

import { Briefcase, Home, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { displayPhone } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAddAddress,
  useArchiveAddress,
  useUpdateCustomerName,
  type Customer,
} from './api';

const LABEL_ICON = { HOME: Home, WORK: Briefcase, OTHER: MapPin } as const;
const LABEL_TEXT = { HOME: 'Home', WORK: 'Work', OTHER: 'Other' } as const;

export function CustomerCard({ customer }: { customer: Customer }) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(customer.name);
  const [addingAddress, setAddingAddress] = useState(false);
  const [addressText, setAddressText] = useState('');
  const [label, setLabel] = useState<'HOME' | 'WORK' | 'OTHER'>('HOME');

  const updateName = useUpdateCustomerName();
  const addAddress = useAddAddress();
  const archiveAddress = useArchiveAddress();

  async function saveName() {
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    try {
      await updateName.mutateAsync({ id: customer.id, name: trimmed });
      setEditingName(false);
      toast.success('Name updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the name.');
    }
  }

  async function saveAddress() {
    if (addressText.trim().length < 3) {
      toast.error('Enter an address first.');
      return;
    }
    try {
      await addAddress.mutateAsync({
        customerId: customer.id,
        input: { label, addressText: addressText.trim() },
      });
      setAddressText('');
      setAddingAddress(false);
      toast.success('Address saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the address.');
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {editingName ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveName();
                }}
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-9 max-w-56"
                  autoFocus
                />
                <Button type="submit" size="sm" loading={updateName.isPending}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingName(false)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <CardTitle className="flex items-center gap-2">
                {customer.name}
                <button
                  type="button"
                  aria-label="Edit name"
                  onClick={() => {
                    setName(customer.name);
                    setEditingName(true);
                  }}
                  className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Pencil className="size-3.5" />
                </button>
              </CardTitle>
            )}
            <p className="data-mono mt-1 text-sm text-muted-foreground">
              {displayPhone(customer.normalizedPhone)}
            </p>
          </div>
          <Badge variant="muted">Shared customer</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {customer.addresses.length > 0 ? (
          <ul className="space-y-2">
            {customer.addresses.map((address) => {
              const Icon = LABEL_ICON[address.label];
              return (
                <li
                  key={address.id}
                  className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="flex min-w-0 items-start gap-2.5">
                    <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">
                        {LABEL_TEXT[address.label]}
                      </p>
                      <p className="text-sm">{address.addressText}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Remove address"
                    onClick={() =>
                      void archiveAddress
                        .mutateAsync({ customerId: customer.id, addressId: address.id })
                        .catch(() => toast.error('Could not remove the address.'))
                    }
                    className="cursor-pointer text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No saved addresses yet.</p>
        )}

        {addingAddress ? (
          <form
            className="space-y-3 rounded-md border border-dashed p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void saveAddress();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <div className="space-y-1.5">
                <Label>Label</Label>
                <Select value={label} onValueChange={(v) => setLabel(v as typeof label)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="HOME">Home</SelectItem>
                    <SelectItem value="WORK">Work</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-address">Address</Label>
                <Input
                  id="new-address"
                  className="h-10"
                  placeholder="Building, street, area"
                  value={addressText}
                  onChange={(e) => setAddressText(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
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
      </CardContent>
    </Card>
  );
}
