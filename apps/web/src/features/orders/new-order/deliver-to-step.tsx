'use client';

import { useTranslations } from 'next-intl';
import { displayAddress, isSameAddress, type AddressLabel } from '@loadless/shared';
import { History, MapPin, TriangleAlert } from 'lucide-react';
import { MapsLinkField } from '@/components/maps-link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  LABEL_ICON,
} from '@/features/customers/addresses/label-meta';
import { AddressPicker } from '@/features/customers/addresses/address-picker';
import { type CustomerAddress, type CustomerProfile } from '@/features/customers/api';

export interface DeliverState {
  mode: 'saved' | 'oneoff';
  selectedAddressId: string | null;
  addressText: string;
  mapsUrl: string;
  saveToProfile: boolean;
  saveLabel: AddressLabel;
}

export const initialDeliverState: DeliverState = {
  mode: 'oneoff',
  selectedAddressId: null,
  addressText: '',
  mapsUrl: '',
  saveToProfile: false,
  saveLabel: 'HOME',
};

/**
 * Where THIS order goes. The customer's saved places are one tap away, but the
 * location changes constantly (they're at work, at a friend's), so a one-off
 * address is always a first-class option — and never touches the profile
 * unless the vendor says so.
 */
export function DeliverToStep({
  customer,
  state,
  onChange,
}: {
  customer: CustomerProfile | null;
  state: DeliverState;
  onChange: (next: DeliverState) => void;
}) {
  const t = useTranslations('address');
  const tl = useTranslations('address.label');
  const selected = customer?.addresses.find((a) => a.id === state.selectedAddressId) ?? null;
  const usualAddressText = customer?.stats.topAddress?.addressText ?? null;

  function selectSaved(address: CustomerAddress) {
    onChange({
      ...state,
      mode: 'saved',
      selectedAddressId: address.id,
      addressText: address.addressText ?? '',
      mapsUrl: address.mapsUrl ?? '',
      saveToProfile: false,
    });
  }

  function somewhereElse() {
    onChange({
      ...state,
      mode: 'oneoff',
      selectedAddressId: null,
      // Keep whatever is typed so "edit for this order" is lossless.
      saveToProfile: false,
    });
  }

  const hasSaved = (customer?.addresses.length ?? 0) > 0;
  const SelectedIcon = selected ? LABEL_ICON[selected.label] : MapPin;

  // Where this vendor actually keeps delivering, derived from order history.
  // Offered when it isn't in the saved book yet — otherwise the vendor retypes
  // their most common address on every single call.
  const top = customer?.stats.topAddress ?? null;
  const topIsSaved =
    !!top && (customer?.addresses ?? []).some((a) => isSameAddress(a.addressText, top.addressText));
  const suggestion = top?.addressText ? top : null;
  const suggestionShown = !!suggestion && !topIsSaved;
  const suggestionUsed = !!suggestion && isSameAddress(state.addressText, suggestion.addressText);

  function useSuggestion() {
    if (!suggestion) return;
    onChange({
      ...state,
      mode: 'oneoff',
      selectedAddressId: null,
      addressText: suggestion.addressText ?? '',
      mapsUrl: suggestion.mapsUrl ?? '',
      // It's demonstrably their usual place — offer to remember it.
      saveToProfile: true,
      saveLabel: 'HOME',
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="size-4 text-primary-strong" aria-hidden /> {t('deliverTo')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasSaved && customer && (
          <>
            <p className="text-xs font-medium text-muted-foreground">
              {t('savedFor', { name: customer.name.split(' ')[0] ?? customer.name })}
            </p>
            <AddressPicker
              addresses={customer.addresses}
              selectedId={state.selectedAddressId}
              usualAddressText={usualAddressText}
              onSelect={selectSaved}
              onSomewhereElse={somewhereElse}
              oneOffActive={state.mode === 'oneoff'}
            />
          </>
        )}

        {suggestionShown && !suggestionUsed && state.mode !== 'saved' && (
          <button
            type="button"
            onClick={useSuggestion}
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed px-3.5 py-2.5 text-start transition-colors duration-150 hover:border-primary-strong/40"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <History className="size-3.5" aria-hidden /> {t('usuallyDeliveredTo')}
                {suggestion.orderCount > 1 ? t('ordersCount', { count: suggestion.orderCount }) : ''}
              </span>
              <span className="mt-0.5 block truncate text-sm">{suggestion.addressText}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-primary-strong">{t('useThis')}</span>
          </button>
        )}

        {state.mode === 'saved' && selected ? (
          <div className="space-y-3 rounded-lg bg-primary/5 px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <SelectedIcon className="size-4 text-muted-foreground" aria-hidden />
                  {t('deliveringTo', { label: tl(selected.label) })}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {displayAddress(selected.addressText, selected.mapsUrl)}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={somewhereElse}>
                {t('editForOrder')}
              </Button>
            </div>

            {selected.mapsUrl ? (
              <p className="text-xs text-muted-foreground">{t('mapsReady')}</p>
            ) : (
              // The mid-call repair: the customer is right there, so ask now.
              // The link goes onto THIS ORDER — which is what the driver taps.
              // It no longer offers to write it back to the saved address:
              // that row is the platform's, and a vendor does not edit it.
              <div className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  {t('noMapsLink', { label: tl(selected.label) })}
                </p>
                <MapsLinkField
                  id="deliver-fix-maps"
                  label={t('mapsLink')}
                  value={state.mapsUrl}
                  onChange={(mapsUrl) => onChange({ ...state, mapsUrl })}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="no-address">{t('addressForThisOrder')}</Label>
              <Input
                id="no-address"
                value={state.addressText}
                onChange={(e) =>
                  onChange({ ...state, addressText: e.target.value, selectedAddressId: null, mode: 'oneoff' })
                }
                placeholder={t('addressPlaceholder')}
              />
              <p className="text-xs text-muted-foreground">
                {t('neverTouchesSaved')}
              </p>
            </div>
            <MapsLinkField
              id="no-maps-link"
              value={state.mapsUrl}
              onChange={(mapsUrl) => onChange({ ...state, mapsUrl, mode: 'oneoff' })}
            />
            {state.addressText.trim().length >= 3 && (
              <div className="space-y-3 rounded-lg bg-primary/5 px-3.5 py-3">
                <div className="flex items-center gap-3">
                  <Switch
                    id="save-address"
                    checked={state.saveToProfile}
                    onCheckedChange={(saveToProfile) => onChange({ ...state, saveToProfile })}
                  />
                  <Label htmlFor="save-address" className="cursor-pointer">
                    {t('alsoSave')}
                  </Label>
                </div>
                {state.saveToProfile && (
                  <div className="flex flex-wrap gap-2">
                    {(['HOME', 'WORK', 'OTHER'] as const).map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => onChange({ ...state, saveLabel: label })}
                        className={cn(
                          'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150',
                          state.saveLabel === label
                            ? 'border-primary-strong bg-primary/10 text-primary-strong'
                            : 'text-muted-foreground hover:border-primary-strong/50 hover:text-foreground',
                        )}
                      >
                        {tl(label)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
