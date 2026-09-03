'use client';

import { createOrderSchema, CURRENCIES, type Currency } from '@loadless/shared';
import { Banknote, StickyNote, TriangleAlert, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
import { PlatformMatches } from '@/features/customers/platform-matches';
import { PhoneSearchInput, usePhoneSearch } from '@/features/customers/phone-search';
import { useCreateOrder } from '@/features/orders/api';
import {
  DeliverToStep,
  initialDeliverState,
  type DeliverState,
} from '@/features/orders/new-order/deliver-to-step';

function NewOrderForm() {
  const t = useTranslations('vendor.newOrder');
  const tcu = useTranslations('vendor.customers');
  const tc = useTranslations('common');
  const router = useRouter();
  const params = useSearchParams();
  const { raw, setRaw, debounced, normalized, isTyping } = usePhoneSearch();
  const search = useCustomerSearch(normalized);
  const createOrder = useCreateOrder();

  const [customerName, setCustomerName] = useState('');
  const [deliver, setDeliver] = useState<DeliverState>(initialDeliverState);
  const [charge, setCharge] = useState('');
  const [currency, setCurrency] = useState<Currency>('LBP');
  const [instructions, setInstructions] = useState('');
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
      toast.error(t('errPhone'));
      return;
    }
    if (search.isError) {
      toast.error(t('errLookup'));
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
      ...(instructions.trim() ? { deliveryInstructions: instructions.trim() } : {}),
    };
    const parsed = createOrderSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t('errForm'));
      return;
    }
    if (isNewCustomer && customerName.trim().length < 2) {
      toast.error(t('errName'));
      return;
    }
    try {
      const order = await createOrder.mutateAsync(parsed.data);
      toast.success(t('created', { orderNumber: order.orderNumber }));
      router.push(`/vendor/orders/${order.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('createFailed'));
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10">
      <div>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      {/* 1 — customer */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="size-4 text-primary" aria-hidden /> {t('customer')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <PhoneSearchInput value={raw} onChange={setRaw} autoFocus />
          {/* Half a number offers who it could be. Without this a mistyped
              digit silently lands on "new customer" and creates a duplicate of
              someone who is already on the platform. */}
          {!phoneReady && <PlatformMatches typed={debounced} onSelect={setRaw} />}
          {phoneReady &&
            (search.isPending ? (
              <CustomerProfileSkeleton variant="compact" />
            ) : search.isError ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3">
                <p className="flex items-center gap-2 text-sm">
                  <TriangleAlert className="size-4 text-destructive" aria-hidden />
                  {tcu('loadFailed')}
                </p>
                <Button variant="outline" size="sm" onClick={() => void search.refetch()}>
                  {tc('tryAgain')}
                </Button>
              </div>
            ) : customer ? (
              <CustomerProfilePanel profile={customer} variant="compact" orderActions="none" />
            ) : (
              <div className="space-y-2">
                <Label htmlFor="no-name">{t('nameLabel')}</Label>
                <Input
                  id="no-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={t('namePlaceholder')}
                />
              </div>
            ))}
        </CardContent>
      </Card>

      {/* 2 — where it goes */}
      <DeliverToStep customer={customer} state={deliver} onChange={setDeliver} />

      {/* 3 — what it costs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Banknote className="size-4 text-primary" aria-hidden /> {t('charge')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div className="space-y-2">
              <Label htmlFor="no-charge">{t('amount')}</Label>
              <Input
                id="no-charge"
                inputMode="decimal"
                dir="ltr"
                className="data-mono"
                placeholder={currency === 'LBP' ? '150000' : '5.00'}
                value={charge}
                onChange={(e) => setCharge(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="no-currency">{t('currency')}</Label>
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
              <StickyNote className="size-3.5 text-muted-foreground" aria-hidden />{' '}
              {t('instructions')}
            </Label>
            <Input
              id="no-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder={t('instructionsPlaceholder')}
            />
          </div>
        </CardContent>
      </Card>

      <Button size="lg" className="w-full" loading={createOrder.isPending} onClick={() => void submit()}>
        {t('create')}
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
