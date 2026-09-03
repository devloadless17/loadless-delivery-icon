'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { displayDateTime } from '@/lib/format';
import { STATUS_META } from './order-status';
import type { OrderTimelineEntry } from './api';

export function OrderTimeline({ entries }: { entries: OrderTimelineEntry[] }) {
  const t = useTranslations('timeline');
  // The status word must match the badge on the same screen — both read the
  // shared catalogue rather than STATUS_META's English label.
  const ts = useTranslations('statusLong');
  if (entries.length === 0) return null;
  return (
    <ol className="space-y-0">
      {entries.map((entry, i) => {
        const meta = STATUS_META[entry.toStatus];
        const isLast = i === entries.length - 1;
        return (
          <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && <span className="absolute start-[5px] top-4 h-full w-px bg-border" aria-hidden />}
            <span className={cn('relative mt-1.5 size-[11px] shrink-0 rounded-full', meta.dotClass)} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">{ts(entry.toStatus)}</p>
              <p className="text-xs text-muted-foreground">
                {t(entry.actorType)} · <bdi>{displayDateTime(entry.createdAt)}</bdi>
              </p>
              {entry.reason && <p className="mt-0.5 text-xs text-muted-foreground">“{entry.reason}”</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
