'use client';

import { useTranslations } from 'next-intl';
import { displayAddress } from '@loadless/shared';
import { ExternalLink, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AddressFields, type AddressDraft } from './address-fields';
import { LABEL_ICON } from './label-meta';
import { useArchiveAddress, useUpdateAddress, type CustomerAddress } from '../api';

export type RowMode = 'view' | 'edit' | 'confirmRemove';

/**
 * A saved address on the profile. Editing and removal happen IN PLACE — a
 * focus-trapping dialog is the wrong interaction while the vendor is holding a
 * phone to their ear.
 */
export function AddressRow({
  customerId,
  address,
  isUsual,
  mode,
  onModeChange,
  onStartOrder,
  canManageAll,
}: {
  customerId: string;
  address: CustomerAddress;
  isUsual: boolean;
  mode: RowMode;
  onModeChange: (mode: RowMode) => void;
  onStartOrder?: (address: CustomerAddress) => void;
  /** ADMIN only. Vendors add addresses but never edit or remove them. */
  canManageAll?: boolean;
}) {
  const t = useTranslations('address');
  const tc = useTranslations('common');
  const tl = useTranslations('address.label');
  const updateAddress = useUpdateAddress();
  const archiveAddress = useArchiveAddress();
  const [draft, setDraft] = useState<AddressDraft>({
    label: address.label,
    addressText: address.addressText ?? '',
    mapsUrl: address.mapsUrl ?? '',
  });

  const Icon = LABEL_ICON[address.label];
  // Saved addresses are the platform's to keep correct. A vendor reads them,
  // adds to them, and otherwise leaves them alone — if this one is wrong for
  // today's delivery they change it on the ORDER, where it is theirs alone.
  const canEdit = !!canManageAll;

  function beginEdit() {
    setDraft({
      label: address.label,
      addressText: address.addressText ?? '',
      mapsUrl: address.mapsUrl ?? '',
    });
    onModeChange('edit');
  }

  async function save() {
    // Either half is a complete location — a shared pin needs no typed text.
    if (draft.addressText.trim().length < 3 && !draft.mapsUrl.trim()) {
      toast.error(t('addOrPaste'));
      return;
    }
    try {
      await updateAddress.mutateAsync({
        customerId,
        addressId: address.id,
        input: {
          label: draft.label,
          addressText: draft.addressText.trim() || null,
          mapsUrl: draft.mapsUrl.trim() || null,
        },
      });
      onModeChange('view');
      toast.success(t('addressUpdated'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('saveFailed'));
    }
  }

  async function remove() {
    try {
      await archiveAddress.mutateAsync({ customerId, addressId: address.id });
      toast.success(t('addressRemoved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('removeFailed'));
      onModeChange('view');
    }
  }

  if (mode === 'edit') {
    return (
      <li className="rounded-lg border border-primary-strong/40 bg-card p-3.5 ring-2 ring-primary-strong/10">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onModeChange('view');
          }}
          className="space-y-3"
        >
          <AddressFields
            value={draft}
            onChange={setDraft}
            idPrefix={`edit-address-${address.id}`}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => onModeChange('view')}>
              {tc('cancel')}
            </Button>
            <Button type="submit" size="sm" loading={updateAddress.isPending}>
              {t('save')}
            </Button>
          </div>
        </form>
      </li>
    );
  }

  if (mode === 'confirmRemove') {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3">
        <p className="text-sm">
          {t('removeConfirm', { label: tl(address.label).toLowerCase() })}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => onModeChange('view')}>
            {t('keep')}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            loading={archiveAddress.isPending}
            onClick={() => void remove()}
          >
            {t('remove')}
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="group rounded-lg border px-3.5 py-3 transition-colors duration-150 hover:border-primary-strong/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {tl(address.label)}
              </p>
              {isUsual && <Badge>{t('usual')}</Badge>}
            </div>
            <p className="text-sm">{displayAddress(address.addressText, address.mapsUrl)}</p>
            {address.mapsUrl ? (
              <a
                href={address.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-primary-strong hover:underline"
              >
                <ExternalLink className="size-3" aria-hidden /> Open in Google Maps
              </a>
            ) : (
              canEdit && (
                <button
                  type="button"
                  onClick={beginEdit}
                  className="mt-0.5 inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-warning hover:underline"
                >
                  <TriangleAlert className="size-3" aria-hidden /> No maps link — add one
                </button>
              )
            )}
            {/* Admin only: WHO added the row. A vendor cannot act on it, so
                showing them a lock and an owner would be noise. */}
            {canEdit && address.ownerVendorName && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Added by {address.ownerVendorName}
              </p>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button variant="ghost" size="icon" aria-label={t('editAddress')} onClick={beginEdit}>
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('removeAddress')}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onModeChange('confirmRemove')}
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      {onStartOrder && (
        <div className={cn('mt-2 flex justify-end')}>
          <Button size="sm" variant="outline" onClick={() => onStartOrder(address)}>
            {t('startOrderHere')}
          </Button>
        </div>
      )}
    </li>
  );
}
