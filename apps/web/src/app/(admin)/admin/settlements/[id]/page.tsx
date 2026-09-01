'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { formatBps } from '@loadless/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError } from '@/lib/api-client';
import { displayDateTime, displayDateTimeFull, displayMoney } from '@/lib/format';
import { useSettlement, useVoidSettlement } from '@/features/admin/settlements/api';

/** The receipt: exactly what was owed, what was handed over, and on what. */
export default function SettlementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending } = useSettlement(id);
  const [voiding, setVoiding] = useState(false);

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (!data) return <p className="text-sm text-muted-foreground">Settlement not found.</p>;

  return (
    <div className="space-y-6">
      <Link
        href="/admin/settlements"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Settlements
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="data-mono text-2xl font-semibold">{data.settlementNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {data.driverName} · {displayDateTimeFull(data.settledAt)}
            {data.collectedByName ? ` · taken by ${data.collectedByName}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">
            Covers{' '}
            {data.periodStart ? displayDateTime(data.periodStart) : 'the driver’s first delivery'}{' '}
            → {displayDateTime(data.periodEnd)}
          </p>
        </div>
        {data.status === 'VOIDED' ? (
          <Badge variant="destructive">Voided</Badge>
        ) : (
          <Button variant="outline" onClick={() => setVoiding(true)}>
            Void
          </Button>
        )}
      </div>

      {data.status === 'VOIDED' && (
        <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          Voided{data.voidedAt ? ` on ${displayDateTimeFull(data.voidedAt)}` : ''}
          {data.voidReason ? ` — ${data.voidReason}` : ''}. The deliveries below went back to
          unsettled and the driver&apos;s balance was restored.
        </p>
      )}

      {/* One card per currency. LBP and USD are never combined into a total. */}
      <div className="grid gap-4 sm:grid-cols-2">
        {data.lines.map((line) => (
          <Card key={line.currency}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{line.currency}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {line.orderCount} {line.orderCount === 1 ? 'delivery' : 'deliveries'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-1 text-sm">
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
                  <dd className="data-mono">{displayMoney(line.totalDue, line.currency)}</dd>
                </div>
                <Row label="Collected" value={displayMoney(line.amountCollected, line.currency)} />
                {BigInt(line.carriedForward) !== 0n &&
                  (BigInt(line.carriedForward) > 0n ? (
                    <div className="flex justify-between font-medium text-warning">
                      <dt>Carried forward</dt>
                      <dd className="data-mono">
                        {displayMoney(line.carriedForward, line.currency)}
                      </dd>
                    </div>
                  ) : (
                    // Positive amount under a positive word — never a minus
                    // sign beneath the label "In credit".
                    <div className="flex justify-between font-medium text-accent">
                      <dt>In credit</dt>
                      <dd className="data-mono">
                        {displayMoney(-BigInt(line.carriedForward), line.currency)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      </div>

      {data.adjustments.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Adjustments
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Adjustment</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.adjustments.map((adjustment) => (
                <TableRow key={adjustment.id}>
                  <TableCell>
                    <div>{adjustment.reason}</div>
                    <div className="text-xs text-muted-foreground">
                      {adjustment.direction === 'DEBIT'
                        ? 'Added to what they owed'
                        : 'Taken off what they owed'}
                    </div>
                  </TableCell>
                  <TableCell className="data-mono text-right">
                    {displayMoney(adjustment.amount, adjustment.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {data.orders && data.orders.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Deliveries covered
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead className="text-right">Charge</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="data-mono hover:underline"
                    >
                      {order.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {displayDateTime(order.deliveredAt)}
                  </TableCell>
                  <TableCell className="data-mono text-right">
                    {displayMoney(order.deliveryCharge, order.currency)}
                  </TableCell>
                  {/* The rate makes each row check out on its own: charge x
                      rate = commission, at THIS driver's negotiated
                      percentage. Every amount carries its own currency code,
                      so LBP and USD rows never read as one another. */}
                  <TableCell className="data-mono text-right">
                    {formatBps(order.commissionBps)}
                  </TableCell>
                  <TableCell className="data-mono text-right">
                    {displayMoney(order.platformCommissionAmount, order.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      <VoidDialog id={id} open={voiding} onOpenChange={setVoiding} />
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

function VoidDialog({
  id,
  open,
  onOpenChange,
}: {
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const voidIt = useVoidSettlement();
  const router = useRouter();

  async function onConfirm() {
    try {
      await voidIt.mutateAsync({ id, reason });
      toast.success('Settlement voided');
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not void this settlement');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void this settlement?</DialogTitle>
          <DialogDescription>
            Nothing is deleted. The record stays in history marked voided, the deliveries go back
            to unsettled and the driver&apos;s balance is restored to what it was before.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="void-reason">Reason</Label>
          <Input
            id="void-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Counted the cash wrong"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={voidIt.isPending || reason.trim().length < 3}
          >
            {voidIt.isPending ? 'Voiding…' : 'Void settlement'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
