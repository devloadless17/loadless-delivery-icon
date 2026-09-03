'use client';

import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { displayPhone } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
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
  omitYours,
  onSelect,
}: {
  typed: string;
  /**
   * Drop the caller's own customers. Set ONLY on a screen that already lists
   * them (the customers page). The order form must never set it: there is no
   * list above it, so hiding your own customers would hide the likeliest match.
   */
  omitYours?: boolean;
  onSelect: (phone: string) => void;
}) {
  const t = useTranslations('lookup');
  const { data, isPending, isError, fetchStatus } = usePlatformLookup(typed);

  // `enabled: false` reports isPending with an idle fetchStatus — not loading.
  if (fetchStatus === 'idle' && !data) return null;
  if (isError) return null;

  const heading = omitYours ? t('onPlatform') : t('matching');

  if (isPending) {
    return (
      <section className="space-y-2" aria-label={heading}>
        <h2 className="text-sm font-semibold text-muted-foreground">{heading}</h2>
        <Skeleton className="h-11 w-full" />
      </section>
    );
  }

  const matches = (data?.matches ?? []).filter((m) => !(omitYours && m.isYours));
  if (matches.length === 0) return null;

  return (
    <section className="space-y-2" aria-label={heading}>
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <Globe className="size-3.5" aria-hidden /> {heading}
      </h2>
      <ul className="divide-y overflow-hidden rounded-lg border">
        {matches.map((match) => (
          <li key={match.id}>
            <button
              type="button"
              onClick={() => onSelect(match.normalizedPhone)}
              className="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-start transition-colors hover:bg-muted/50"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{match.name}</span>
                {match.isYours && <Badge variant="muted">{t('yourCustomer')}</Badge>}
              </span>
              <span className="data-mono shrink-0 text-sm text-muted-foreground">
                <bdi>{displayPhone(match.normalizedPhone)}</bdi>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        {data?.hasMore ? t('hasMore') : omitYours ? t('notServed') : t('pickOne')}
      </p>
    </section>
  );
}
