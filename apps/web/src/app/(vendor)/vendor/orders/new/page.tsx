'use client';

import { createOrderSchema, CURRENCIES, type Currency } from '@loadless/shared';
import { Banknote, StickyNote, TriangleAlert, UserRound } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api-client';
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
import { useCustomerSearch } from '@/features/customers/api';
import { CustomerProfilePanel } from '@/features/customers/customer-profile-panel';
import { CustomerProfileSkeleton } from '@/features/customers/profile/profile-skeleton';
import { PhoneSearchInput, usePhoneSearch } from '@/features/customers/phone-search';
import { useCreateOrder } from '@/features/orders/api';
import {
  DeliverToStep,
  initialDeliverState,
  type DeliverState,
} from '@/features/orders/new-order/deliver-to-step';

function NewOrderForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { raw, setRaw, normalized, isTyping } = usePhoneSearch();
  const search = useCustomerSearch(normalized);
  const createOrder = useCreateOrder();

  const [customerName, setCustomerName] = useState('');
  const [deliver, setDeliver] = useState<DeliverState>(initialDeliverState);
  const [charge, setCharge] = useState('');
  const [currency, setCurrency] = useState<Currency>('LBP');
  const [instructions, setInstructions] = useState('');
  const [notes, setNotes] = useState('');
  const autoSelected = useRef(false);
  /** ?addressId= — one saved address to preselect, applied once, then dropped. */
  const preselectAddressId = useRef<string | null>(null);
  /** undefined until the first run, so mount never counts as "changed". */
  const previousPhone = useRef<string | null | undefined>(undefined);

  const customer = search.data?.customer ?? null;
  const phoneReady = normalized !== null && !isTyping;
  const isNewCustomer = phoneReady && !search.isPending && !search.isError && customer === null;

  // The form ALWAYS opens blank. The only things a link may carry are who the
  // order is for and which saved address to start on — never an amount, notes
  // or instructions from a previous delivery. Read once, then the URL is
  // cleaned so a back navigation can't re-apply anything over live edits.
  useEffect(() => {
    const phoneParam = params.get('phone');
    if (!phoneParam) return;
    preselectAddressId.current = params.get('addressId');
    setRaw(phoneParam);
    router.replace('/vendor/orders/new', { scroll: false });
    // Intentionally mount-only: params are read imperatively above, so later
    // navigations can't re-trigger this.
  }, []);

  // Auto-select the usual address once, so the common case is zero taps —
  // but the confirmation strip always states the choice, never silently.
  useEffect(() => {
    if (autoSelected.current || !customer || customer.addresses.length === 0) return;
    // An address named in the link wins: the vendor already picked it on the
    // profile, and second-guessing them there would be the silent-carry-over
    // behaviour this form no longer does.
    const requested = preselectAddressId.current
      ? customer.addresses.find((a) => a.id === preselectAddressId.current)
      : undefined;
    preselectAddressId.current = null; // applies once
    const usual = customer.stats.topAddress?.addressText?.trim().toLowerCase();
    const pick =
      requested ??
      (usual
        ? customer.addresses.find((a) => a.addressText?.trim().toLowerCase() === usual)
        : undefined) ??
      (customer.addresses.length === 1 ? customer.addresses[0] : undefined);
    if (!pick) return;
    autoSelected.current = true;
    setDeliver((prev) => ({
      ...prev,
      mode: 'saved',
      selectedAddressId: pick.id,
      addressText: pick.addressText ?? '',
      mapsUrl: pick.mapsUrl ?? '',
      saveToProfile: false,
    }));
  }, [customer]);

  // A different customer means a fresh location decision. The initial mount
  // must not count as a change, or a ?phone= link would reset itself.
  useEffect(() => {
    const previous = previousPhone.current;
    previousPhone.current = normalized;
    if (previous === undefined || previous === normalized) return;
    autoSelected.current = false;
    setDeliver(initialDeliverState);
  }, [normalized]);

  async function submit() {
    if (!normalized) {
      toast.error('Enter the customer’s phone number first.');
      return;
    }
    if (search.isError) {
      toast.error('Customer lookup failed — try the search again before creating the order.');
      return;
    }
    const input = {
      customerPhone: normalized,
      ...(isNewCustomer ? { customerName: customerName.trim() } : {}),
      saveAddressToCustomer: deliver.saveToProfile && deliver.selectedAddressId === null,
      ...(deliver.saveToProfile ? { saveAddressLabel: deliver.saveLabel } : {}),
      deliveryAddressText: deliver.addressText.trim(),
      ...(deliver.mapsUrl.trim() ? { deliveryMapsUrl: deliver.mapsUrl.trim() } : {}),
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
    if (isNewCustomer && customerName.trim().length < 2) {
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
              <CustomerProfileSkeleton variant="compact" />
            ) : search.isError ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3">
                <p className="flex items-center gap-2 text-sm">
                  <TriangleAlert className="size-4 text-destructive" aria-hidden />
                  Couldn&apos;t load this customer
                </p>
                <Button variant="outline" size="sm" onClick={() => void search.refetch()}>
                  Try again
                </Button>
              </div>
            ) : customer ? (
              <CustomerProfilePanel profile={customer} variant="compact" orderActions="none" />
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

      {/* 2 — where it goes */}
      <DeliverToStep customer={customer} state={deliver} onChange={setDeliver} />

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
              <Label htmlFor="no-currency">Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger id="no-currency">
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

      <Button size="lg" className="w-full" loading={createOrder.isPending} onClick={() => void submit()}>
        Create order
      </Button>
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <Suspense fallback={null}>
      <NewOrderForm />
    </Suspense>
  );
}
