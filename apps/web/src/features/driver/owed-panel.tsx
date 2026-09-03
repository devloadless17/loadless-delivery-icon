'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { Pagination } from '@/components/pagination';
import { CheckCircle2, Wallet } from 'lucide-react';
import { formatMoney } from '@loadless/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { displayDateTime, displayMoney, isolate } from '@/lib/format';
import { OrderBreakdown } from '@/features/settlements/order-breakdown';
import { useMyOwed, useMySettlements } from './api';

/**
 * "How much is on me right now" — and, once he has paid, that nothing is.
 *
 * This is the same figure the admin collects against, deliberately: the two of
 * them are standing together counting cash, and the one thing that must not
 * happen is the driver's phone disagreeing with the admin's screen. It updates
 * live over the socket, so the moment the handover is recorded the driver sees
 * himself go clear.
 */
export function OwedPanel() {
  const t = useTranslations('driver.settlement');
  const td = useTranslations('driver.earnings');
  const { data, isPending } = useMyOwed();

  if (isPending) return <Skeleton className="h-28 w-full" />;
  if (!data) return null;

  // A driver who OVERPAID has a negative balance. Rendering that under "To
  // hand over" told him to hand over minus ten thousand pounds — the same
  // inversion that showed on the admin's worklist, and worse here, because
  // this is the screen he checks before walking in to pay.
  const owedLines = data.lines.filter((line) => BigInt(line.totalDue) > 0n);
  const creditLines = data.lines.filter((line) => BigInt(line.totalDue) < 0n);
  // Credit that exactly cancels this period's commission. He owes nothing, so
  // "all settled" is true — but saying only that would quietly swallow the fact
  // that his credit is what paid for these deliveries.
  const coveredByCredit = data.lines.filter(
    (line) => BigInt(line.totalDue) === 0n && line.unsettledOrderCount > 0,
  );

  if (owedLines.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/10 p-4">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        <div>
          <p className="font-semibold text-success">{t('allSettled')}</p>
          <p className="text-sm text-muted-foreground">
            {data.lastSettledAt
              ? t('nothingOwedSince', { when: isolate(displayDateTime(data.lastSettledAt)) })
              : t('nothingOwed')}
          </p>
          {creditLines.map((line) => (
            <p key={line.currency} className="mt-1 text-sm font-medium text-success">
              {t('overpaid', { amount: displayMoney(-BigInt(line.totalDue), line.currency) })}
            </p>
          ))}
          {coveredByCredit.map((line) => (
            <p key={line.currency} className="mt-1 text-sm text-muted-foreground">
              {t('creditCovered', {
                amount: displayMoney(line.unsettledCommission, line.currency),
                count: line.unsettledOrderCount,
              })}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    // A named landmark: this is the figure the driver is asked to act on, so it
    // should be reachable directly by anyone navigating by region rather than
    // found by scrolling. It also gives a test something honest to scope to.
    <section
      aria-label={t('toHandOver')}
      className="rounded-lg border border-warning/30 bg-warning/10 p-4"
    >
      <div className="flex items-center gap-2">
        <Wallet className="size-5 shrink-0 text-warning" aria-hidden />
        <p className="font-semibold text-warning">{t('toHandOver')}</p>
      </div>
      <div className="mt-3 space-y-4">
        {owedLines.map((line) => (
          // Stacked per currency, never added together — LBP and USD are
          // separate piles of cash and the driver counts them separately.
          <div key={line.currency}>
            <p className="data-mono whitespace-nowrap text-2xl font-bold">
              <bdi>{formatMoney(line.totalDue, line.currency)}</bdi>
            </p>
            <p className="text-xs text-muted-foreground">
              {td('deliveries', { count: line.unsettledOrderCount })}
              {BigInt(line.broughtForward) !== 0n &&
                t('includesCarried', {
                  amount: displayMoney(line.broughtForward, line.currency),
                })}
            </p>

            {/* Every delivery behind the figure, on his own phone, before he
                hands anything over. He should never have to take the number on
                trust or wait for a receipt to find out what it was for. */}
            <OrderBreakdown
              orders={data.orders}
              currency={line.currency}
              expectedCount={line.unsettledOrderCount}
              expectedTotal={line.unsettledCommission}
            />
            {BigInt(line.broughtForward) !== 0n && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('plusLeftOver', { amount: displayMoney(line.broughtForward, line.currency) })}
              </p>
            )}
          </div>
        ))}

        {creditLines.map((line) => (
          <p key={line.currency} className="text-sm font-medium text-success">
            {t('inCredit', { amount: displayMoney(-BigInt(line.totalDue), line.currency) })}
          </p>
        ))}
      </div>
    </section>
  );
}

/** His own receipts — proof he handed the money over. */
export function MySettlements() {
  const t = useTranslations('driver.settlement');
  const [page, setPage] = useState(1);
  const { data, isPending } = useMySettlements(page);

  if (isPending) return <Skeleton className="h-24 w-full" />;
  if (!data || data.data.length === 0) return null;

  return (
    <>
      <h2 className="pt-2 text-base font-semibold">{t('handovers')}</h2>
      <ul className="space-y-2">
        {data.data.map((settlement) => (
          <li key={settlement.id} className="rounded-lg border bg-card">
            <Link
              href={`/driver/settlements/${settlement.id}`}
              className="block px-4 py-3 active:bg-muted/50"
            >
            <div className="flex items-center justify-between gap-3">
              <span className="data-mono text-sm font-semibold">
                <bdi>{settlement.settlementNumber}</bdi>
              </span>
              <span className="text-xs text-muted-foreground">
                <bdi>{displayDateTime(settlement.settledAt)}</bdi>
              </span>
            </div>
            {settlement.status === 'VOIDED' ? (
              <p className="mt-1 text-xs text-destructive">{t('voidedShort')}</p>
            ) : (
              <div className="mt-1 space-y-0.5">
                {settlement.lines.map((line) => (
                  // The label and the amount are separate children on a flex
                  // row, not one interpolated sentence: `data-mono` marks a bare
                  // numeric run, and putting it on a line that also carries
                  // Arabic prose made two amounts collide with no gap between
                  // them. gap-x-2 holds in either direction.
                  <p
                    key={line.currency}
                    className="flex flex-wrap items-baseline gap-x-2 text-sm"
                  >
                    <span>
                      {t('paidLabel')}{' '}
                      <bdi className="data-mono">
                        {displayMoney(line.amountCollected, line.currency)}
                      </bdi>
                    </span>
                    {BigInt(line.carriedForward) > 0n && (
                      <span className="text-xs text-warning">
                        <bdi className="data-mono">
                          {displayMoney(line.carriedForward, line.currency)}
                        </bdi>{' '}
                        {t('carriedOverLabel')}
                      </span>
                    )}
                    {BigInt(line.carriedForward) < 0n && (
                      // Overpaying was invisible here. Money the driver is owed
                      // should never be the thing his receipt declines to show.
                      <span className="text-xs text-success">
                        <bdi className="data-mono">
                          {displayMoney(-BigInt(line.carriedForward), line.currency)}
                        </bdi>{' '}
                        {t('creditLabel')}
                      </span>
                    )}
                  </p>
                ))}
                {settlement.adjustments.length > 0 && (
                  // Without this he has no reason to open the receipt, which is
                  // the only place the explanation lives. An unexpected charge
                  // should announce itself where he will actually see it.
                  <p className="text-xs text-muted-foreground">
                    {settlement.adjustments.length === 1
                      ? t('includesAdjustment', { reason: settlement.adjustments[0]!.reason })
                      : t('includesAdjustments', { count: settlement.adjustments.length })}
                  </p>
                )}
              </div>
            )}
            </Link>
          </li>
        ))}
      </ul>
      {/* Ten at a time, but every one of them reachable. The page height stays
          fixed however long the driver has been working. */}
      {data.meta.totalPages > 1 && <Pagination meta={data.meta} onPageChange={setPage} />}
    </>
  );
}
