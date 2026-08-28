'use client';

import { Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomerSearch } from '@/features/customers/api';
import { CustomerCard } from '@/features/customers/customer-card';
import { NewCustomerForm } from '@/features/customers/new-customer-form';
import { PhoneSearchInput, usePhoneSearch } from '@/features/customers/phone-search';

export default function VendorCustomersPage() {
  const { raw, setRaw, normalized, isTyping } = usePhoneSearch();
  const search = useCustomerSearch(normalized);

  const showResult = normalized !== null && !isTyping;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="text-sm text-muted-foreground">
          Look up any customer by phone — the customer list is shared across the whole platform.
        </p>
      </div>

      <PhoneSearchInput value={raw} onChange={setRaw} autoFocus />

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
        <Skeleton className="h-44 w-full" />
      ) : search.data?.customer ? (
        <CustomerCard customer={search.data.customer} />
      ) : (
        <NewCustomerForm normalizedPhone={normalized} />
      )}
    </div>
  );
}
