'use client';

import { createOrderSchema, CURRENCIES, type Currency } from '@loadless/shared';
import { Banknote, MapPin, StickyNote, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { displayPhone } from '@/lib/format';
import { MapPicker } from '@/lib/map';
import { cn } from '@/lib/utils';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomerSearch } from '@/features/customers/api';
import { PhoneSearchInput, usePhoneSearch } from '@/features/customers/phone-search';
import { useCreateOrder } from '@/features/orders/api';

export default function NewOrderPage() {
  const router = useRouter();
  const { raw, setRaw, normalized, isTyping } = usePhoneSearch();
  const search = useCustomerSearch(normalized);
  const createOrder = useCreateOrder();

  const [customerName, setCustomerName] = useState('');
  const [addressText, setAddressText] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [saveAddress, setSaveAddress] = useState(false);
  const [charge, setCharge] = useState('');
  const [currency, setCurrency] = useState<Currency>('LBP');
  const [instructions, setInstructions] = useState('');
  const [notes, setNotes] = useState('');

  const customer = search.data?.customer ?? null;
  const phoneReady = normalized !== null && !isTyping;
  const isNewCustomer = phoneReady && !search.isPending && customer === null;

  function pickSavedAddress(id: string) {
    const address = customer?.addresses.find((a) => a.id === id);
    if (!address) return;
    setSelectedAddressId(id);
    setAddressText(address.addressText);
    setPin(address.lat != null && address.lng != null ? { lat: address.lat, lng: address.lng } : null);
    setSaveAddress(false);
  }

  async function submit() {
    if (!normalized) {
      toast.error('Enter the customer’s phone number first.');
      return;
    }
    const input = {
      customerPhone: normalized,
      ...(isNewCustomer ? { customerName: customerName.trim() } : {}),
      saveAddressToCustomer: saveAddress && selectedAddressId === null,
      deliveryAddressText: addressText.trim(),
      ...(pin ? { deliveryLat: pin.lat, deliveryLng: pin.lng } : {}),
      currency,
      deliveryCharge: charge.trim(),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(instructions.trim() ? { deliveryInstructions: instructions.trim() } : {}),
    };
    const parsed = createOrderSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Check the form and try again.');
      return;
    }
    if (isNewCustomer && (!customerName.trim() || customerName.trim().length < 2)) {
      toast.error('Enter the customer’s name.');
      return;
    }
    try {
      const order = await createOrder.mutateAsync(parsed.data);
      toast.success(`Order ${order.orderNumber} created`);
      router.push(`/vendor/orders/${order.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not create the order.');
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10">
      <div>
        <h1 className="text-2xl font-semibold">New order</h1>
        <p className="text-sm text-muted-foreground">Start with the customer&apos;s phone number.</p>
      </div>

      {/* 1 — customer */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="size-4 text-primary" aria-hidden /> Customer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <PhoneSearchInput value={raw} onChange={setRaw} autoFocus />
          {phoneReady &&
            (search.isPending ? (
              <Skeleton className="h-10 w-full" />
            ) : customer ? (
              <div className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium">{customer.name}</p>
                  <p className="data-mono text-xs text-muted-foreground">
                    {displayPhone(customer.normalizedPhone)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">Known customer</span>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="no-name">Customer name (new customer)</Label>
                <Input
                  id="no-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Their name — saved for every vendor"
                />
              </div>
            ))}
        </CardContent>
      </Card>

      {/* 2 — delivery location */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="size-4 text-primary" aria-hidden /> Deliver to
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {customer && customer.addresses.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {customer.addresses.map((address) => (
                <button
                  key={address.id}
                  type="button"
                  onClick={() => pickSavedAddress(address.id)}
                  className={cn(
                    'cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                    selectedAddressId === address.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:border-primary/50 hover:text-foreground',
                  )}
                >
                  {address.label === 'HOME' ? 'Home' : address.label === 'WORK' ? 'Work' : 'Other'} ·{' '}
                  {address.addressText.slice(0, 28)}
                  {address.addressText.length > 28 ? '…' : ''}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="no-address">Address for THIS order</Label>
            <Input
              id="no-address"
              value={addressText}
              onChange={(e) => {
                setAddressText(e.target.value);
                setSelectedAddressId(null);
              }}
              placeholder="Building, street, area"
            />
            <p className="text-xs text-muted-foreground">
              Changing it here never touches the customer&apos;s saved addresses.
            </p>
          </div>
          <div className="overflow-hidden rounded-md border">
            <MapPicker value={pin} onChange={(p) => { setPin(p); setSelectedAddressId(null); }} className="h-60 w-full" />
          </div>
          <p className="text-xs text-muted-foreground">
            Tap the map to drop the pin, or drag it to adjust.
          </p>
          {selectedAddressId === null && addressText.trim().length >= 3 && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={saveAddress}
                onChange={(e) => setSaveAddress(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Also save this address to the customer&apos;s profile
            </label>
          )}
        </CardContent>
      </Card>

      {/* 3 — charge & notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Banknote className="size-4 text-primary" aria-hidden /> Delivery charge
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div className="space-y-2">
              <Label htmlFor="no-charge">Amount</Label>
              <Input
                id="no-charge"
                inputMode="decimal"
                className="data-mono"
                placeholder={currency === 'LBP' ? '150000' : '5.00'}
                value={charge}
                onChange={(e) => setCharge(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="no-instructions" className="flex items-center gap-1.5">
              <StickyNote className="size-3.5 text-muted-foreground" aria-hidden /> Delivery
              instructions (optional)
            </Label>
            <Input
              id="no-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Call when downstairs, 3rd floor"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="no-notes">Internal notes (optional)</Label>
            <Input
              id="no-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Only your team and the platform see this"
            />
          </div>
        </CardContent>
      </Card>

      <Button
        size="lg"
        className="w-full"
        loading={createOrder.isPending}
        onClick={() => void submit()}
      >
        Create order
      </Button>
    </div>
  );
}
