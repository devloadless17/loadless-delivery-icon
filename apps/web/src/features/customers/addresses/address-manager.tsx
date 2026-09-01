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

type EditTarget =
  | { kind: 'row'; id: string; mode: RowMode }
  /** `copiedFrom` = the address text this draft started as, so an unchanged save is caught. */
  | { kind: 'new'; copiedFrom?: string }
  | null;

/**
 * The address book on the profile. A single `editing` slot means two forms can
 * never be open at once — mid-call, one thing at a time is the whole point.
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
  /** ADMIN: every row is editable, whoever added it. */
  canManageAll?: boolean;
}) {
  const [editing, setEditing] = useState<EditTarget>(null);
  const [draft, setDraft] = useState<AddressDraft>(emptyAddressDraft);
  const addAddress = useAddAddress();

  /**
   * Copy an address the caller does not own, so they can correct it and own
   * the corrected one.
   *
   * The address book holds ONE row per place, so this is not a private copy
   * and saving it unchanged creates nothing — the dedupe returns the existing
   * row. The form says so, and the toast below refuses to claim otherwise.
   */
  function copyAndCorrect(address: CustomerAddress) {
    setDraft({
      label: address.label,
      addressText: address.addressText ?? '',
      mapsUrl: address.mapsUrl ?? '',
    });
    setEditing({ kind: 'new', copiedFrom: address.addressText ?? '' });
  }

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
        toast.error(
          saved.ownership === 'MINE'
            ? 'You already have this address saved.'
            : 'This exact address already exists. Change what’s different to save your own.',
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
              {...(canManageAll ? { canManageAll } : { onCopyAndCorrect: copyAndCorrect })}
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
          {editing.copiedFrom !== undefined && (
            <p className="text-xs text-muted-foreground">
              Copied from an address you don&apos;t own. Correct what&apos;s wrong — it saves as a
              separate address that you own. Everyone can still see both.
            </p>
          )}
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
