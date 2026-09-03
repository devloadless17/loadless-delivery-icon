'use client';

import { TriangleAlert, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCustomerSearch } from '@/features/customers/api';
import { CustomerCreateDialog } from '@/features/customers/customer-create-dialog';
import { CustomerProfilePanel } from '@/features/customers/customer-profile-panel';
import { MyCustomersList } from '@/features/customers/my-customers-list';
import { PlatformMatches } from '@/features/customers/platform-matches';
import { NewCustomerForm } from '@/features/customers/new-customer-form';
import { CustomerProfileSkeleton } from '@/features/customers/profile/profile-skeleton';
import { PhoneSearchInput, usePhoneSearch } from '@/features/customers/phone-search';

export default function VendorCustomersPage() {
  const t = useTranslations('vendor.customers');
  const tc = useTranslations('common');
  const { raw, setRaw, normalized, isTyping, debounced } = usePhoneSearch();
  const search = useCustomerSearch(normalized);
  const [createOpen, setCreateOpen] = useState(false);

  // A COMPLETE phone number opens that person's profile directly — including
  // someone this vendor has never served, which is the mid-call path.
  // Anything else (a name, a half-typed number) filters their own customers
  // below as they type.
  const showResult = normalized !== null && !isTyping;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus /> {t('new')}
        </Button>
      </div>

      <div className="sticky top-14 z-10 -mx-4 bg-background/95 px-4 py-2 backdrop-blur">
        <PhoneSearchInput value={raw} onChange={setRaw} autoFocus mode="any" />
      </div>

      {!showResult ? (
        <>
          {/* Results narrow with every keystroke; the moment the text becomes a
              complete number this gives way to the profile. */}
          <MyCustomersList q={debounced.trim()} onSelect={setRaw} />
          {/* …and once enough digits exist, who ELSE on the platform it could
              be. omitYours: the vendor's own matches are already in the list
              above with their real context. */}
          <PlatformMatches typed={debounced} omitYours onSelect={setRaw} />
        </>
      ) : search.isPending ? (
        <CustomerProfileSkeleton />
      ) : search.isError ? (
        // Never fall through to "isn't on the platform yet" on an error — that
        // tells the vendor, mid-call, that a real customer doesn't exist.
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <TriangleAlert className="size-7 text-destructive" aria-hidden />
          <div>
            <p className="font-medium">{t('loadFailed')}</p>
            <p className="text-sm text-muted-foreground">{t('loadFailedBody')}</p>
          </div>
          <Button variant="outline" onClick={() => void search.refetch()}>
            {tc('tryAgain')}
          </Button>
        </div>
      ) : search.data?.customer ? (
        <CustomerProfilePanel profile={search.data.customer} />
      ) : (
        <NewCustomerForm normalizedPhone={normalized} />
      )}

      <CustomerCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialPhone={raw}
        onCreated={(customer) => setRaw(customer.normalizedPhone)}
      />
    </div>
  );
}
