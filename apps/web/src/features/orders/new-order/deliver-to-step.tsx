'use client';

import { displayAddress, isSameAddress, type AddressLabel } from '@loadless/shared';
import { History, MapPin, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { MapsLinkField } from '@/components/maps-link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ApiError } from '@/lib/api-client';
import {
  LABEL_ICON,
  LABEL_TEXT,
} from '@/features/customers/addresses/label-meta';
import { AddressPicker } from '@/features/customers/addresses/address-picker';
import { useUpdateAddress, type CustomerAddress, type CustomerProfile } from '@/features/customers/api';

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
  const updateAddress = useUpdateAddress();
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

  async function saveLinkToProfile() {
    if (!customer || !selected) return;
    try {
      await updateAddress.mutateAsync({
        customerId: customer.id,
        addressId: selected.id,
        input: { mapsUrl: state.mapsUrl.trim() },
      });
      toast.success('Maps link saved to their profile');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the link.');
    }
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
          <MapPin className="size-4 text-primary" aria-hidden /> Deliver to
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasSaved && customer && (
          <>
            <p className="text-xs font-medium text-muted-foreground">
              Saved for {customer.name.split(' ')[0]} — tap to choose
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
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed px-3.5 py-2.5 text-left transition-colors duration-150 hover:border-primary/40"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <History className="size-3.5" aria-hidden /> Usually delivered to
                {suggestion.orderCount > 1 ? ` · ${suggestion.orderCount} orders` : ''}
              </span>
              <span className="mt-0.5 block truncate text-sm">{suggestion.addressText}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-primary">Use this</span>
          </button>
        )}

        {state.mode === 'saved' && selected ? (
          <div className="space-y-3 rounded-lg bg-primary/5 px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <SelectedIcon className="size-4 text-muted-foreground" aria-hidden />
                  Delivering to {LABEL_TEXT[selected.label]}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {displayAddress(selected.addressText, selected.mapsUrl)}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={somewhereElse}>
                Edit for this order
              </Button>
            </div>

            {selected.mapsUrl ? (
              <p className="text-xs text-muted-foreground">Maps link ready for the driver.</p>
            ) : (
              // The mid-call repair: the customer is right there, so ask now.
              <div className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                  <TriangleAlert className="size-3.5" aria-hidden />
                  {LABEL_TEXT[selected.label]} has no maps link — ask them to send it now.
                </p>
                <MapsLinkField
                  id="deliver-fix-maps"
                  label="Google Maps link"
                  value={state.mapsUrl}
                  onChange={(mapsUrl) => onChange({ ...state, mapsUrl })}
                />
                {state.mapsUrl.trim() && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    loading={updateAddress.isPending}
                    onClick={() => void saveLinkToProfile()}
                  >
                    Also save this link to {LABEL_TEXT[selected.label]}
                  </Button>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="no-address">Address for THIS order</Label>
              <Input
                id="no-address"
                value={state.addressText}
                onChange={(e) =>
                  onChange({ ...state, addressText: e.target.value, selectedAddressId: null, mode: 'oneoff' })
                }
                placeholder="Street, building, floor — e.g. Hamra st, Salame bldg, 3rd"
              />
              <p className="text-xs text-muted-foreground">
                Changing it here never touches the customer&apos;s saved addresses.
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
                    Also save this address to the customer&apos;s profile
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
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:border-primary/50 hover:text-foreground',
                        )}
                      >
                        {LABEL_TEXT[label]}
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
