'use client';

import { useTranslations } from 'next-intl';
import { Search, TriangleAlert, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { displayPhone, displayRelative } from '@/lib/format';
import { useMyCustomers } from './api';

/**
 * "My customers" — everyone this vendor added or has ordered for.
 *
 * It sits under the one search box on the page, filtering live as the vendor
 * types — a name, or any prefix of a number. So the screen answers both
 * questions at once: "who is this number?" and "who do I deliver to?".
 *
 * `q` is bounded to the vendor's own customers by the API. Someone they have
 * never dealt with is still reachable — but only by typing a complete phone
 * number, never by browsing or by guessing at a name.
 */
export function MyCustomersList({
  q,
  onSelect,
}: {
  /** The live search text from the page's single box. */
  q: string;
  onSelect: (phone: string) => void;
}) {
  const t = useTranslations('customer');
  const [page, setPage] = useState(1);
  const { data, isPending, isError, refetch } = useMyCustomers({ page, q });

  // A new search starts at page 1 — otherwise a narrow result set lands the
  // vendor on an empty page 3 and looks like "no customers".
  useEffect(() => setPage(1), [q]);

  // Defensive: this list shares a screen with the mid-call phone lookup, and
  // nothing about browsing is worth taking that lookup down for.
  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <section className="space-y-3" aria-label="My customers">
      <h2 className="text-sm font-semibold text-muted-foreground">
        {q ? t('matchingYours') : t('myCustomers')}
        {meta ? <span className="ml-1.5 font-normal">({meta.total})</span> : null}
      </h2>

      {isError ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 py-10 text-center">
          <TriangleAlert className="size-7 text-destructive" aria-hidden />
          <p className="text-sm font-medium">Couldn&apos;t load your customers</p>
          <p className="text-sm text-muted-foreground">
            You can still reach anyone by typing their phone number above.
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : rows.length > 0 ? (
        <>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('nameCol')}</TableHead>
                  {/* A vendor reads this standing at a counter, on a phone.
                      Five columns at 390px wraps every name onto three lines,
                      so below `sm` the secondary facts collapse into a single
                      sub-line under the name instead. One DOM either way. */}
                  <TableHead className="hidden sm:table-cell">Phone</TableHead>
                  <TableHead className="hidden sm:table-cell">Orders</TableHead>
                  <TableHead className="hidden sm:table-cell">Last order</TableHead>
                  <TableHead className="hidden sm:table-cell">Addresses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    // Click anywhere on the row as a convenience, but the row
                    // keeps its `row` role — the real control is the name
                    // button below, so keyboard and screen-reader users get a
                    // named target instead of a table row pretending to be one.
                    onClick={() => onSelect(row.normalizedPhone)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          className="cursor-pointer text-left hover:underline"
                          // Selecting fills the phone box above, so the profile
                          // it opens is the SAME panel the search path renders —
                          // one screen, never two that can drift.
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect(row.normalizedPhone);
                          }}
                        >
                          {row.name}
                        </button>
                        {row.addedByYou && <Badge variant="muted">{t('addedByYou')}</Badge>}
                      </span>
                      {/* Only when they diverge: the shared record still says
                          something else, and hiding that is what causes the
                          "who am I actually looking at?" moment on a call. */}
                      {row.displayName && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          Platform: {row.baseName}
                        </span>
                      )}
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:hidden">
                        <span className="data-mono">{displayPhone(row.normalizedPhone)}</span>
                        {' · '}
                        {row.ordersCount} {row.ordersCount === 1 ? 'order' : 'orders'}
                        {row.lastOrderAt ? ` · ${displayRelative(row.lastOrderAt)}` : ''}
                      </span>
                    </TableCell>
                    <TableCell className="data-mono hidden sm:table-cell">
                      {displayPhone(row.normalizedPhone)}
                    </TableCell>
                    <TableCell className="data-mono hidden sm:table-cell">
                      {row.ordersCount}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {row.lastOrderAt ? displayRelative(row.lastOrderAt) : '—'}
                    </TableCell>
                    <TableCell className="data-mono hidden sm:table-cell">
                      {row.addressCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {meta && <Pagination meta={meta} onPageChange={setPage} />}
          {/* Only alongside results — the empty state below says the same
              thing in its own words, and saying it twice reads as a warning. */}
          {/\d/.test(q) && (
            <p className="text-sm text-muted-foreground">
              Finish the number to open anyone on the platform.
            </p>
          )}
        </>
      ) : q ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
          <Search className="size-7 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">No match among your customers</p>
          <p className="text-sm text-muted-foreground">
            Type their full phone number above to reach anyone on the platform.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
          <UserPlus className="size-7 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">No customers yet</p>
          <p className="text-sm text-muted-foreground">
            Search a phone number above to find or add your first one.
          </p>
        </div>
      )}
    </section>
  );
}
