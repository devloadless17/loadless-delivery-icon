'use client';

import { Globe } from 'lucide-react';
import { displayPhone } from '@/lib/format';
import { Skeleton } from '@/components/ui/skeleton';
import { usePlatformLookup } from './api';

/**
 * "Did you mean one of these?" for a number the vendor has not finished typing.
 *
 * The only place a vendor sees someone they have never served without knowing
 * the whole number — so it shows identity and nothing else. No order count, no
 * address, no sign of which shop serves them: all of that is the competitive
 * information the shared-customer model exists to withhold. Picking one just
 * fills the search box, and the ordinary profile path takes over from there.
 */
export function PlatformMatches({
  typed,
  onSelect,
}: {
  typed: string;
  onSelect: (phone: string) => void;
}) {
  const { data, isPending, isError, fetchStatus } = usePlatformLookup(typed);

  // `enabled: false` reports isPending with an idle fetchStatus — not loading.
  if (fetchStatus === 'idle' && !data) return null;
  if (isError) return null;

  if (isPending) {
    return (
      <section className="space-y-2" aria-label="On the platform">
        <h2 className="text-sm font-semibold text-muted-foreground">On the platform</h2>
        <Skeleton className="h-11 w-full" />
      </section>
    );
  }

  // The caller's own customers are filtered out server-side, so anyone here is
  // genuinely someone they have not served.
  const matches = data?.matches ?? [];
  if (matches.length === 0) return null;

  return (
    <section className="space-y-2" aria-label="On the platform">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Globe className="size-3.5" aria-hidden /> On the platform
      </h2>
      <ul className="divide-y overflow-hidden rounded-lg border">
        {matches.map((match) => (
          <li key={match.id}>
            <button
              type="button"
              onClick={() => onSelect(match.normalizedPhone)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/50"
            >
              <span className="truncate text-sm font-medium">{match.name}</span>
              <span className="data-mono shrink-0 text-sm text-muted-foreground">
                {displayPhone(match.normalizedPhone)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {data?.hasMore
          ? 'More numbers start this way — type another digit to narrow it down.'
          : "You haven't served these customers — open one to see their details."}
      </p>
    </section>
  );
}
