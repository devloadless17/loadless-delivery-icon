'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Bike } from 'lucide-react';
import { formatBps, formatMoney, type SettlementPreviewView } from '@loadless/shared';
import { api } from '@/lib/api-client';
import { displayPhone, fileUrl } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { OrderBreakdown } from '@/features/settlements/order-breakdown';
import type { AdminDriver } from './api';

/**
 * Built entirely on the settlement PREVIEW, which is the same computation the
 * end-of-day handover runs — so this screen and the Settle dialog can never
 * disagree about what a driver owes. It persists nothing.
 */
function usePreview(driverId: string | null) {
  return useQuery({
    queryKey: ['admin', 'drivers', 'preview', driverId],
    queryFn: () =>
      api.get<SettlementPreviewView>(`/admin/drivers/${driverId}/settlements/preview`),
    enabled: driverId !== null,
    staleTime: 15_000,
  });
}

export function DriverDetailDialog({
  driver,
  onOpenChange,
}: {
  driver: AdminDriver | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { data, isPending, isError } = usePreview(driver?.id ?? null);

  return (
    <Dialog open={driver !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Driver</DialogTitle>
          <DialogDescription>
            Everything owed to the platform since this driver last settled, and the deliveries
            behind it.
          </DialogDescription>
        </DialogHeader>

        {driver === null ? null : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              {driver.facePhotoKey ? (
                <img
                  src={fileUrl(driver.facePhotoKey)}
                  alt=""
                  className="size-12 rounded-full border object-cover"
                />
              ) : (
                <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Bike className="size-5" aria-hidden />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold">{driver.fullName}</p>
                <p className="data-mono text-sm text-muted-foreground">
                  {displayPhone(driver.contactPhone)}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
                <Badge variant={driver.status === 'ACTIVE' ? 'success' : 'destructive'}>
                  {driver.status === 'ACTIVE' ? 'Active' : 'Suspended'}
                </Badge>
                {driver.dutyStatus === 'ON_DUTY' ? (
                  <Badge variant="accent">On duty</Badge>
                ) : (
                  <Badge variant="muted">Off duty</Badge>
                )}
                <Badge variant="muted">
                  {driver.commissionOverrideBps === null
                    ? 'Default rate'
                    : formatBps(driver.commissionOverrideBps)}
                </Badge>
              </div>
            </div>

            {isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : isError || !data ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3 text-sm">
                Couldn&apos;t load what this driver owes.
              </p>
            ) : (
              <>
                {/* One block per currency: a driver can carry LBP and USD at the
                    same time and the two never net off against each other.

                    The line below totalDue names the figures it is made of, and
                    that is only honest while preview computes
                    totalDue = commissionDue + broughtForward (settlements.service
                    `preview`). It has no adjustments term — adjustments are
                    entered at settle time — which is why `SettlementPreviewView`
                    Omits adjustmentsTotal. If preview ever starts folding
                    adjustments in, this breakdown must gain that term or stop
                    reading as a sum. */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Balance with the platform</p>
                  {data.lines.length === 0 ? (
                    <p className="rounded-lg border border-dashed px-3.5 py-4 text-sm text-muted-foreground">
                      Nothing outstanding — this driver is square.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-lg border">
                      {data.lines.map((line) => {
                        // A balance goes NEGATIVE when the driver has overpaid,
                        // and then the platform owes HIM. Printing "-10,000"
                        // under a heading that says he owes it states the exact
                        // opposite of the truth, so the sign picks the wording.
                        const due = BigInt(line.totalDue);
                        const carried = BigInt(line.broughtForward);
                        return (
                          <li key={line.currency} className="space-y-1 px-3.5 py-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-3">
                              <span className="text-sm font-medium">{line.currency}</span>
                              {due < 0n ? (
                                <span className="data-mono text-lg font-bold text-accent">
                                  {formatMoney(-due, line.currency)} in credit
                                </span>
                              ) : (
                                <span className="data-mono text-lg font-bold">
                                  {formatMoney(due, line.currency)} owed
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {line.orderCount} {line.orderCount === 1 ? 'delivery' : 'deliveries'} ·
                              collected {formatMoney(line.grossCharge, line.currency)} · commission{' '}
                              {formatMoney(line.commissionDue, line.currency)}
                              {carried > 0n
                                ? ` · brought forward ${formatMoney(carried, line.currency)}`
                                : ''}
                              {carried < 0n
                                ? ` · overpaid ${formatMoney(-carried, line.currency)}`
                                : ''}
                            </p>
                            {/* Shared with the settle dialog, the driver's own
                                phone and both receipts. It compares the rows
                                against the true count and total, which matters
                                here because orders[] is capped at
                                SETTLEMENT_ORDER_LIST_LIMIT while
                                lines[].orderCount is not — a truncated list
                                reads as broken arithmetic otherwise. */}
                            <OrderBreakdown
                              orders={data.orders}
                              currency={line.currency}
                              expectedCount={line.orderCount}
                              expectedTotal={line.commissionDue}
                              label="The deliveries behind this"
                            />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

              </>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/admin/orders?driverId=${driver.id}`)}
              >
                All their orders
              </Button>
              <Button size="sm" onClick={() => router.push('/admin/settlements')}>
                Settle up
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
