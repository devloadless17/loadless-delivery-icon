'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { formatMoney } from '@loadless/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { displayDateTimeFull, displayMoney } from '@/lib/format';
import { useMySettlement } from '@/features/driver/api';
import { OrderBreakdown } from '@/features/settlements/order-breakdown';

/**
 * A driver's own receipt for a handover he made.
 *
 * The API has always been able to answer this; until now nothing on the phone
 * asked. A driver who paid last week and is asked about it this week should be
 * able to open the record himself rather than take somebody's word for it.
 */
export default function DriverSettlementPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending } = useMySettlement(id);

  if (isPending) return <Skeleton className="h-80 w-full" />;
  if (!data) return <p className="text-sm text-muted-foreground">Handover not found.</p>;

  return (
    <div className="space-y-4">
      <Link
        href="/driver/earnings"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> Earnings
      </Link>

      <div>
        <h1 className="data-mono text-xl font-semibold">{data.settlementNumber}</h1>
        <p className="text-sm text-muted-foreground">{displayDateTimeFull(data.settledAt)}</p>
      </div>

      {data.status === 'VOIDED' && (
        <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <Badge variant="destructive">Voided</Badge>
          <p className="mt-1.5">
            This handover was reversed{data.voidReason ? ` — ${data.voidReason}` : ''}. Its
            deliveries went back to unsettled.
          </p>
        </div>
      )}

      {/* One block per currency. LBP and USD are separate piles of cash and are
          never shown as a single total. */}
      {data.lines.map((line) => (
        <div key={line.currency} className="rounded-lg border bg-card p-4">
          <p className="font-semibold">{line.currency}</p>
          <dl className="mt-2 space-y-1 text-sm">
            <Row label="Commission" value={displayMoney(line.commissionDue, line.currency)} />
            {BigInt(line.adjustmentsTotal) !== 0n && (
              <Row
                label="Adjustments"
                value={displayMoney(line.adjustmentsTotal, line.currency)}
              />
            )}
            {BigInt(line.broughtForward) !== 0n && (
              <Row
                label="Brought forward"
                value={displayMoney(line.broughtForward, line.currency)}
              />
            )}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <dt>Total due</dt>
              <dd className="data-mono">{formatMoney(line.totalDue, line.currency)}</dd>
            </div>
            <Row label="You paid" value={displayMoney(line.amountCollected, line.currency)} />
            {BigInt(line.carriedForward) !== 0n &&
              // The label already flips on the sign; the AMOUNT has to flip too,
              // or it reads "In credit  -10,000 LBP" — a negative under a
              // positive word. And a credit is good news for the driver, so it
              // should not be painted in the warning colour.
              (BigInt(line.carriedForward) > 0n ? (
                <div className="flex justify-between font-medium text-warning">
                  <dt>Carried over</dt>
                  <dd className="data-mono">{displayMoney(line.carriedForward, line.currency)}</dd>
                </div>
              ) : (
                <div className="flex justify-between font-medium text-success">
                  <dt>In credit</dt>
                  <dd className="data-mono">
                    {displayMoney(-BigInt(line.carriedForward), line.currency)}
                  </dd>
                </div>
              ))}
          </dl>

          <OrderBreakdown
            orders={data.orders ?? []}
            currency={line.currency}
            expectedCount={line.orderCount}
            expectedTotal={line.commissionDue}
          />
        </div>
      ))}

      {data.adjustments.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="mb-2 font-semibold">Adjustments</p>
          <ul className="space-y-2 text-sm">
            {data.adjustments.map((adjustment) => (
              <li key={adjustment.id} className="flex justify-between gap-3">
                <span>
                  <span>{adjustment.reason}</span>
                  <span className="block text-xs text-muted-foreground">
                    {adjustment.direction === 'DEBIT'
                      ? 'Added to what you owed'
                      : 'Taken off what you owed'}
                  </span>
                </span>
                <span className="data-mono shrink-0">
                  {displayMoney(adjustment.amount, adjustment.currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="data-mono">{value}</dd>
    </div>
  );
}
