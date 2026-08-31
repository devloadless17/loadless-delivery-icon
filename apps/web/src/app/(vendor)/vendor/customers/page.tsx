'use client';

import { TriangleAlert, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useCustomerSearch } from '@/features/customers/api';
import { CustomerCreateDialog } from '@/features/customers/customer-create-dialog';
import { CustomerProfilePanel } from '@/features/customers/customer-profile-panel';
import { NewCustomerForm } from '@/features/customers/new-customer-form';
import { CustomerProfileSkeleton } from '@/features/customers/profile/profile-skeleton';
import { PhoneSearchInput, usePhoneSearch } from '@/features/customers/phone-search';

export default function VendorCustomersPage() {
  const { raw, setRaw, normalized, isTyping } = usePhoneSearch();
  const search = useCustomerSearch(normalized);
  const [createOpen, setCreateOpen] = useState(false);

  const showResult = normalized !== null && !isTyping;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">
            Look up any customer by phone — the customer list is shared across the whole platform.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus /> New customer
        </Button>
      </div>

      <div className="sticky top-14 z-10 -mx-4 bg-background/95 px-4 py-2 backdrop-blur">
        <PhoneSearchInput value={raw} onChange={setRaw} autoFocus />
      </div>

      {!showResult ? (
        raw.trim() === '' ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-14 text-center">
            <Users className="size-8 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">Search by phone number</p>
              <p className="text-sm text-muted-foreground">
                Any format works: 03 123 456, 70123456, +961 3 123 456…
              </p>
            </div>
          </div>
        ) : (
          <p className="px-1 text-sm text-muted-foreground">Keep typing — enter a full number.</p>
        )
      ) : search.isPending ? (
        <CustomerProfileSkeleton />
      ) : search.isError ? (
        // Never fall through to "isn't on the platform yet" on an error — that
        // tells the vendor, mid-call, that a real customer doesn't exist.
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <TriangleAlert className="size-7 text-destructive" aria-hidden />
          <div>
            <p className="font-medium">Couldn&apos;t load this customer</p>
            <p className="text-sm text-muted-foreground">
              Check your connection and try again.
            </p>
          </div>
          <Button variant="outline" onClick={() => void search.refetch()}>
            Try again
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
