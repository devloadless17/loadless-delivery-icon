'use client';

import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * What a list shows when the request FAILED, as opposed to when it succeeded
 * and there is nothing to show.
 *
 * The admin lists used to destructure only `{ data, isPending }`, so a 500 or a
 * dropped connection fell through to the empty state: an outage rendered as
 * "No customers yet". That is the worst possible reading — it says the client's
 * data is gone rather than that the request failed, and it offers no way to try
 * again. Distinguishing the two is the whole job of this component.
 */
export function ListError({
  what,
  onRetry,
}: {
  /** Plural noun for the rows, e.g. "customers", "orders". */
  what: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 py-10 text-center">
      <TriangleAlert className="size-7 text-destructive" aria-hidden />
      <p className="text-sm font-medium">Couldn&apos;t load {what}</p>
      <p className="text-sm text-muted-foreground">
        This is a problem reaching the server, not an empty list.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
