'use client';

import Link from 'next/link';
import { CheckCircle2, Wallet } from 'lucide-react';
import { formatMoney } from '@loadless/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { displayDateTime, displayMoney } from '@/lib/format';
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
          <p className="font-semibold text-success">You&apos;re all settled</p>
          <p className="text-sm text-muted-foreground">
            Nothing is owed to the platform
            {data.lastSettledAt ? ` — last handover ${displayDateTime(data.lastSettledAt)}` : ''}.
          </p>
          {creditLines.map((line) => (
            <p key={line.currency} className="mt-1 text-sm font-medium text-success">
              You paid {displayMoney(-BigInt(line.totalDue), line.currency)} too much last time —
              it comes off your next handover.
            </p>
          ))}
          {coveredByCredit.map((line) => (
            <p key={line.currency} className="mt-1 text-sm text-muted-foreground">
              Your credit covered the {displayMoney(line.unsettledCommission, line.currency)}{' '}
              commission on {line.unsettledOrderCount}{' '}
              {line.unsettledOrderCount === 1 ? 'delivery' : 'deliveries'}.
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
      <div className="flex items-center gap-2">
        <Wallet className="size-5 shrink-0 text-warning" aria-hidden />
        <p className="font-semibold text-warning">To hand over</p>
      </div>
      <div className="mt-3 space-y-4">
        {owedLines.map((line) => (
          // Stacked per currency, never added together — LBP and USD are
          // separate piles of cash and the driver counts them separately.
          <div key={line.currency}>
            <p className="data-mono whitespace-nowrap text-2xl font-bold">
              {formatMoney(line.totalDue, line.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {line.unsettledOrderCount}{' '}
              {line.unsettledOrderCount === 1 ? 'delivery' : 'deliveries'}
              {BigInt(line.broughtForward) !== 0n &&
                ` · includes ${displayMoney(line.broughtForward, line.currency)} carried over`}
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
                Plus {displayMoney(line.broughtForward, line.currency)} left over from your last
                handover.
              </p>
            )}
          </div>
        ))}

        {creditLines.map((line) => (
          <p key={line.currency} className="text-sm font-medium text-success">
            You are {displayMoney(-BigInt(line.totalDue), line.currency)} in credit — it comes off
            your next handover.
          </p>
        ))}
      </div>
    </div>
  );
}

/** His own receipts — proof he handed the money over. */
export function MySettlements() {
  const { data, isPending } = useMySettlements();

  if (isPending) return <Skeleton className="h-24 w-full" />;
  if (!data || data.data.length === 0) return null;

  return (
    <>
      <h2 className="pt-2 text-base font-semibold">Handovers</h2>
      <ul className="space-y-2">
        {data.data.map((settlement) => (
          <li key={settlement.id} className="rounded-lg border bg-card">
            <Link
              href={`/driver/settlements/${settlement.id}`}
              className="block px-4 py-3 active:bg-muted/50"
            >
            <div className="flex items-center justify-between gap-3">
              <span className="data-mono text-sm font-semibold">
                {settlement.settlementNumber}
              </span>
              <span className="text-xs text-muted-foreground">
                {displayDateTime(settlement.settledAt)}
              </span>
            </div>
            {settlement.status === 'VOIDED' ? (
              <p className="mt-1 text-xs text-destructive">Voided — this handover was reversed.</p>
            ) : (
              <div className="mt-1 space-y-0.5">
                {settlement.lines.map((line) => (
                  <p key={line.currency} className="data-mono text-sm">
                    Paid {displayMoney(line.amountCollected, line.currency)}
                    {BigInt(line.carriedForward) > 0n && (
                      <span className="ml-2 text-xs text-warning">
                        {displayMoney(line.carriedForward, line.currency)} carried over
                      </span>
                    )}
                    {BigInt(line.carriedForward) < 0n && (
                      // Overpaying was invisible here. Money the driver is owed
                      // should never be the thing his receipt declines to show.
                      <span className="ml-2 text-xs text-success">
                        {displayMoney(-BigInt(line.carriedForward), line.currency)} in credit
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
                      ? `Includes an adjustment: ${settlement.adjustments[0]!.reason}`
                      : `Includes ${settlement.adjustments.length} adjustments — tap to see why`}
                  </p>
                )}
              </div>
            )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
