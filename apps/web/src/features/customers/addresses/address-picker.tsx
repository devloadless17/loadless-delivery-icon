'use client';

import { useTranslations } from 'next-intl';
import { displayAddress, isSameAddress } from '@loadless/shared';
import { Check, Plus, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LABEL_ICON } from './label-meta';
import type { CustomerAddress } from '../api';

/**
 * Choose where THIS order goes. Cards rather than chips: the vendor has to be
 * able to read the floor number, not a 28-character stub.
 */
export function AddressPicker({
  addresses,
  selectedId,
  usualAddressText,
  onSelect,
  onSomewhereElse,
  oneOffActive,
}: {
  addresses: CustomerAddress[];
  selectedId: string | null;
  usualAddressText?: string | null;
  onSelect: (address: CustomerAddress) => void;
  onSomewhereElse: () => void;
  oneOffActive: boolean;
}) {
  const t = useTranslations('address');
  const tl = useTranslations('address.label');
  return (
    <div role="radiogroup" aria-label={t('deliverTo')} className="grid gap-2 sm:grid-cols-2">
      {addresses.map((address) => {
        const Icon = LABEL_ICON[address.label];
        const selected = address.id === selectedId;
        const isUsual = isSameAddress(address.addressText, usualAddressText);
        return (
          <button
            key={address.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(address)}
            className={cn(
              'flex min-h-[5.5rem] cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition-all duration-150',
              selected
                ? 'border-primary-strong bg-primary/5 ring-2 ring-primary-strong/15'
                : 'bg-card hover:border-primary-strong/40',
            )}
          >
            <span className="flex items-center gap-1.5">
              <Icon className="size-3.5 text-muted-foreground" aria-hidden />
              <span className="text-xs font-medium text-muted-foreground">
                {tl(address.label)}
              </span>
              {isUsual && <Badge className="ml-0.5">Usual</Badge>}
              {selected && <Check className="ms-auto size-4 text-primary-strong" aria-hidden />}
            </span>
            <span className="line-clamp-2 text-sm">
              {displayAddress(address.addressText, address.mapsUrl)}
            </span>
            {address.mapsUrl ? (
              <span className="mt-auto text-xs text-muted-foreground">Maps link ready</span>
            ) : (
              <span className="mt-auto inline-flex items-center gap-1 text-xs text-warning">
                <TriangleAlert className="size-3" aria-hidden /> No maps link
              </span>
            )}
          </button>
        );
      })}

      <button
        type="button"
        role="radio"
        aria-checked={oneOffActive}
        onClick={onSomewhereElse}
        className={cn(
          'flex min-h-[5.5rem] cursor-pointer flex-col justify-center gap-1 rounded-lg border border-dashed p-3 text-left transition-all duration-150',
          addresses.length <= 1 && 'sm:col-span-2',
          oneOffActive
            ? 'border-primary-strong bg-primary/5 ring-2 ring-primary-strong/15'
            : 'hover:border-primary-strong/40',
        )}
      >
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Plus className="size-4 text-muted-foreground" aria-hidden /> {t('somewhereElse')}
        </span>
        <span className="text-xs text-muted-foreground">
          They&apos;re at work or a friend&apos;s place today
        </span>
      </button>
    </div>
  );
}
