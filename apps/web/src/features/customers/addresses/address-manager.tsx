'use client';

import { MapPinPlus, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { isSameAddress } from '@loadless/shared';
import { AddressFields, emptyAddressDraft, type AddressDraft } from './address-fields';
import { AddressRow, type RowMode } from './address-row';
import { useAddAddress, type CustomerAddress } from '../api';

type EditTarget = { kind: 'row'; id: string; mode: RowMode } | { kind: 'new' } | null;

/**
 * The address book on the profile.
 *
 * A vendor may ADD a place and nothing more — editing and removing are the
 * platform's. A single `editing` slot means two forms can never be open at
 * once: mid-call, one thing at a time is the whole point.
 */
export function AddressManager({
  customerId,
  addresses,
  usualAddressText,
  onStartOrder,
  canManageAll,
}: {
  customerId: string;
  addresses: CustomerAddress[];
  usualAddressText?: string | null;
  onStartOrder?: (address: CustomerAddress) => void;
  /** ADMIN: rows are editable and removable. Vendors only ever add. */
  canManageAll?: boolean;
}) {
  const [editing, setEditing] = useState<EditTarget>(null);
  const [draft, setDraft] = useState<AddressDraft>(emptyAddressDraft);
  const addAddress = useAddAddress();

  async function save() {
    if (draft.addressText.trim().length < 3) {
      toast.error('Enter an address first.');
      return;
    }
    try {
      const saved = await addAddress.mutateAsync({
        customerId,
        input: {
          label: draft.label,
          addressText: draft.addressText.trim(),
          ...(draft.mapsUrl.trim() ? { mapsUrl: draft.mapsUrl.trim() } : {}),
        },
      });

      // `created === false` means the dedupe matched something already there.
      // Saying "Address saved" then is a lie the vendor can disprove by
      // looking at the list, so say what actually happened and keep the form
      // open — they still have the correction to make.
      if (saved.created === false) {
        // Name the field that actually collided. A pin can match while the
        // address text is completely different, and telling someone to "change
        // the address" then sends them to edit the wrong box — which is
        // exactly what happened the first time this message existed.
        toast.error(
          saved.matchedOn === 'link'
            ? 'That Google Maps link is already saved for this customer. Clear the link to add a separate description of the place.'
            : 'That address is already saved for this customer.',
        );
        return;
      }
      setDraft(emptyAddressDraft);
      setEditing(null);
      toast.success('Address saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the address.');
    }
  }

  const rowMode = (id: string): RowMode =>
    editing?.kind === 'row' && editing.id === id ? editing.mode : 'view';

  return (
    <div className="space-y-3">
      {addresses.length > 0 ? (
        <ul className="space-y-2">
          {addresses.map((address) => (
            <AddressRow
              key={address.id}
              customerId={customerId}
              address={address}
              isUsual={isSameAddress(address.addressText, usualAddressText)}
              mode={rowMode(address.id)}
              onModeChange={(mode) =>
                setEditing(mode === 'view' ? null : { kind: 'row', id: address.id, mode })
              }
              {...(onStartOrder ? { onStartOrder } : {})}
              {...(canManageAll ? { canManageAll } : {})}
            />
          ))}
        </ul>
      ) : (
        editing?.kind !== 'new' && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-8 text-center">
            <MapPinPlus className="size-7 text-muted-foreground" aria-hidden />
            <div>
              <p className="text-sm font-medium">No saved addresses yet</p>
              <p className="text-sm text-muted-foreground">
                Add the one they&apos;re giving you right now.
              </p>
            </div>
            <Button size="sm" onClick={() => setEditing({ kind: 'new' })}>
              <Plus /> Add address
            </Button>
          </div>
        )
      )}

      {editing?.kind === 'new' ? (
        <form
          aria-label="New address"
          className="space-y-3 rounded-lg border border-dashed p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditing(null);
          }}
        >
          <AddressFields value={draft} onChange={setDraft} idPrefix="new-address" autoFocus />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={addAddress.isPending}>
              Save address
            </Button>
          </div>
        </form>
      ) : (
        addresses.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => setEditing({ kind: 'new' })}>
            <Plus /> Add address
          </Button>
        )
      )}
    </div>
  );
}
