'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatBps, formatMoney, type Currency, type SettlementOrderView } from '@loadless/shared';
import { cn } from '@/lib/utils';
import { displayDateTime } from '@/lib/format';

/**
 * "Why do I owe this?" — the itemised answer, shared by every surface that has
 * to defend a figure: the admin's settle dialog, the driver's own phone, and
 * both receipts.
 *
 * Each row shows the whole sum rather than just its result — what the delivery
 * charged, the rate applied, and the commission that came out — so a driver on
 * a negotiated 25% can check the arithmetic himself instead of taking the
 * number on trust while handing over cash.
 *
 * Shape matters as much as content here. A busy driver settles 30+ deliveries,
 * and 30 rows rendered inline would push the amount-collected box and the
 * confirm button off the screen, turning the evidence into an obstacle. So the
 * list is COLLAPSED behind a summary that already carries the two facts most
 * questions are really about (how many, how much), and when opened it scrolls
 * inside its own box with the subtotal pinned below it — the figure being
 * argued over never scrolls away.
 */
export function OrderBreakdown({
  orders,
  currency,
  expectedCount,
  expectedTotal,
  label,
}: {
  orders: SettlementOrderView[];
  currency: Currency;
  /** The true number of deliveries — the list may be capped. */
  expectedCount: number;
  /** Commission total the rows should add up to, in minor units. */
  expectedTotal: string;
  label?: string;
}) {
  const t = useTranslations('breakdown');
  const [open, setOpen] = useState(false);
  const rows = orders.filter((o) => o.currency === currency);
  if (rows.length === 0) return null;

  const shownTotal = rows.reduce((sum, o) => sum + BigInt(o.platformCommissionAmount), 0n);
  const truncated = rows.length < expectedCount;
  const reconciles = !truncated && shownTotal.toString() === expectedTotal;

  return (
    <div className="mt-3 border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-start"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium underline underline-offset-2">
          {label ?? t('whatFor')}
          <ChevronDown
            className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </span>
        {/* The two facts most questions are actually about, before opening it. */}
        <span className="shrink-0 text-xs text-muted-foreground">
          {t('deliveries', { count: expectedCount })}
        </span>
      </button>

      {open && (
        <>
          {/* Its own scroll box: a long list must never push the amount box and
              the confirm button out of reach. */}
          <ul className="mt-2 max-h-60 divide-y overflow-y-auto rounded-md border">
            {rows.map((order) => (
              <li
                key={order.id}
                className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm"
              >
                <span className="min-w-0">
                  <span className="data-mono font-medium">
                    <bdi>{order.orderNumber}</bdi>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    <bdi>{displayDateTime(order.deliveredAt)}</bdi>
                  </span>
                </span>
                <span className="shrink-0 text-end">
                  <span className="data-mono block whitespace-nowrap">
                    <bdi>{formatMoney(order.platformCommissionAmount, order.currency)}</bdi>
                  </span>
                  <span className="block whitespace-nowrap text-xs text-muted-foreground">
                    <bdi>
                      {formatMoney(order.deliveryCharge, order.currency)} ×{' '}
                      {formatBps(order.commissionBps)}
                    </bdi>
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {truncated && (
            // A partial list whose amounts fall short of the total reads as a
            // mistake. Say plainly that it is only the most recent slice.
            <p className="mt-2 text-xs text-warning">
              {t('truncated', { shown: rows.length, total: expectedCount })}
            </p>
          )}

          {reconciles && (
            // Pinned OUTSIDE the scroll box, so the number under discussion is
            // always on screen however far the list is scrolled.
            <div className="mt-2 flex justify-between text-sm font-semibold">
              <span>{t('commissionFrom')}</span>
              <span className="data-mono">
                <bdi>{formatMoney(shownTotal, currency)}</bdi>
              </span>
            </div>
          )}

          {!truncated && !reconciles && (
            // Should be unreachable: both sides derive from the same rows. If it
            // ever fires, the figure is not trustworthy, and saying so beats
            // rendering a confident wrong number to someone handing over cash.
            <p className="mt-2 text-xs text-destructive">
              {t('mismatch', {
                shown: formatMoney(shownTotal, currency),
                expected: formatMoney(expectedTotal, currency),
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
