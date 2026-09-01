'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  CURRENCIES,
  adjustmentSignedMinor,
  formatMoney,
  fromMinorUnits,
  toMinorUnits,
  type AdjustmentDirection,
  type Currency,
  type SettlementAdjustmentInput,
} from '@loadless/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { displayMoney } from '@/lib/format';
import { OrderBreakdown } from '@/features/settlements/order-breakdown';
import { useSettleDriver, useSettlementPreview } from './api';

type DraftAdjustment = SettlementAdjustmentInput & { key: string };

/**
 * Recording the cash a driver hands over.
 *
 * The screen is built around one rule: the admin and the driver are standing
 * together, counting the same notes. So every currency gets its own column of
 * arithmetic (LBP and USD are never added up), the amount collected defaults to
 * the full total but can be edited down to whatever was actually handed over,
 * and a shortfall is shown plainly rather than hidden.
 */
export function SettleDialog({
  driverId,
  driverName,
  open,
  onOpenChange,
}: {
  driverId: string | null;
  driverName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const preview = useSettlementPreview(open ? driverId : null);
  const settle = useSettleDriver();

  const [collections, setCollections] = useState<Record<string, string>>({});
  const [adjustments, setAdjustments] = useState<DraftAdjustment[]>([]);
  const [note, setNote] = useState('');
  const [staleWarning, setStaleWarning] = useState<string | null>(null);

  const lines = useMemo(() => preview.data?.lines ?? [], [preview.data]);

  // Default each box to the full amount owed. The admin edits down only when
  // the driver is actually short.
  useEffect(() => {
    if (!preview.data) return;
    setCollections(
      Object.fromEntries(
        preview.data.lines.map((line) => [
          line.currency,
          fromMinorUnits(line.totalDue, line.currency),
        ]),
      ),
    );
    setAdjustments([]);
    setNote('');
    setStaleWarning(null);
  }, [preview.data]);

  /** Per-currency arithmetic, recomputed live as adjustments are added. */
  const computed = useMemo(() => {
    return lines.map((line) => {
      const adjustmentsTotal = adjustments
        .filter((a) => a.currency === line.currency)
        .reduce((sum, a) => sum + (adjustmentSignedMinor(a) ?? 0n), 0n);
      const totalDue = BigInt(line.totalDue) + adjustmentsTotal;
      const typed = collections[line.currency] ?? '';
      const collected = toMinorUnits(typed, line.currency);
      return {
        ...line,
        adjustmentsTotal,
        totalDue,
        collected,
        shortfall: collected === null ? null : totalDue - collected,
      };
    });
  }, [lines, adjustments, collections]);

  // A currency that exists only because of an adjustment still needs a box.
  const adjustmentOnlyCurrencies = useMemo(
    () =>
      CURRENCIES.filter(
        (currency) =>
          !lines.some((line) => line.currency === currency) &&
          adjustments.some((a) => a.currency === currency),
      ),
    [lines, adjustments],
  );

  const invalidAmount = computed.some((row) => row.collected === null);
  const overpaying = computed.some((row) => row.shortfall !== null && row.shortfall < 0n);
  const nothingOwed = !preview.isPending && lines.length === 0 && adjustments.length === 0;

  async function onSubmit() {
    if (!driverId || !preview.data) return;
    try {
      const result = await settle.mutateAsync({
        driverId,
        input: {
          cutoffAt: new Date(preview.data.cutoffAt),
          expected: lines.map((line) => ({
            currency: line.currency,
            orderCount: line.orderCount,
            totalDue: line.totalDue,
          })),
          collections: Object.entries(collections)
            .filter(([, amount]) => amount.trim() !== '')
            .map(([currency, amountCollected]) => ({
              currency: currency as Currency,
              amountCollected,
            })),
          adjustments: adjustments.map(({ key: _key, ...rest }) => rest),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      toast.success(`Settled — ${result.settlementNumber}`);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SETTLEMENT_TOTALS_CHANGED') {
        // The driver delivered something else while the admin was counting.
        // Re-fetch and make them confirm the new figure rather than quietly
        // collecting against a total nobody agreed to.
        setStaleWarning(err.message);
        void preview.refetch();
        return;
      }
      toast.error(err instanceof ApiError ? err.message : 'Could not record the settlement');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settle with {driverName}</DialogTitle>
          <DialogDescription>
            Count the cash together, then record exactly what was handed over.
          </DialogDescription>
        </DialogHeader>

        {preview.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : nothingOwed ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {driverName} has nothing outstanding.
          </p>
        ) : (
          <div className="space-y-4">
            {staleWarning && (
              <p className="flex items-start gap-2 rounded-lg bg-warning/15 p-3 text-sm text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>{staleWarning} Check the new figures below before confirming.</span>
              </p>
            )}

            {computed.map((row) => (
              <div key={row.currency} className="rounded-lg border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold">{row.currency}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.orderCount} {row.orderCount === 1 ? 'delivery' : 'deliveries'}
                  </span>
                </div>

                <dl className="space-y-1 text-sm">
                  <Row label="Commission" value={displayMoney(row.commissionDue, row.currency)} />
                  {BigInt(row.broughtForward) !== 0n && (
                    <Row
                      label="Brought forward"
                      value={displayMoney(row.broughtForward, row.currency)}
                      muted
                    />
                  )}
                  {row.adjustmentsTotal !== 0n && (
                    <Row
                      label="Adjustments"
                      value={displayMoney(row.adjustmentsTotal, row.currency)}
                      muted
                    />
                  )}
                  <div className="flex items-center justify-between border-t pt-2 font-semibold">
                    <dt>Total due</dt>
                    <dd className="data-mono">{formatMoney(row.totalDue, row.currency)}</dd>
                  </div>
                </dl>

                {/* The itemisation sits with the figure it defends. The driver
                    is standing here asking why; the answer should not be on a
                    receipt he can only see after he has already paid. */}
                <OrderBreakdown
                  orders={preview.data?.orders ?? []}
                  currency={row.currency}
                  expectedCount={row.orderCount}
                  expectedTotal={row.commissionDue}
                  label="Show the deliveries"
                />

                <div className="mt-3 space-y-1.5">
                  <Label htmlFor={`collected-${row.currency}`}>Collected</Label>
                  <Input
                    id={`collected-${row.currency}`}
                    inputMode="decimal"
                    className="data-mono"
                    value={collections[row.currency] ?? ''}
                    onChange={(e) =>
                      setCollections((prev) => ({ ...prev, [row.currency]: e.target.value }))
                    }
                  />
                  {row.collected === null ? (
                    <p className="text-xs text-destructive">
                      Enter a valid {row.currency} amount
                    </p>
                  ) : row.shortfall! > 0n ? (
                    <p className="text-xs text-warning">
                      Short by {formatMoney(row.shortfall!, row.currency)} — carried to next time
                    </p>
                  ) : row.shortfall! < 0n ? (
                    <p className="text-xs text-warning">
                      Overpaying by {formatMoney(-row.shortfall!, row.currency)} — left as credit
                    </p>
                  ) : (
                    <p className="text-xs text-success">Paid in full</p>
                  )}
                </div>
              </div>
            ))}

            {adjustmentOnlyCurrencies.map((currency) => (
              <div key={currency} className="rounded-lg border p-4">
                <p className="mb-2 text-sm font-semibold">{currency}</p>
                <Label htmlFor={`collected-${currency}`}>Collected</Label>
                <Input
                  id={`collected-${currency}`}
                  inputMode="decimal"
                  className="data-mono mt-1.5"
                  value={collections[currency] ?? ''}
                  onChange={(e) =>
                    setCollections((prev) => ({ ...prev, [currency]: e.target.value }))
                  }
                />
              </div>
            ))}

            <AdjustmentEditor value={adjustments} onChange={setAdjustments} />

            <div className="space-y-1.5">
              <Label htmlFor="settle-note">Note (optional)</Label>
              <Input
                id="settle-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Anything worth remembering about this handover"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={settle.isPending || preview.isPending || nothingOwed || invalidAmount}
          >
            {settle.isPending ? 'Recording…' : overpaying ? 'Record overpayment' : 'Record payment'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? 'text-muted-foreground' : undefined}>{label}</dt>
      <dd className="data-mono">{value}</dd>
    </div>
  );
}

/**
 * Fines, bonuses, advances and corrections. Their existence is what keeps an
 * admin from misreporting the collected amount to make the numbers work.
 * The amount is always typed as a positive figure — the TYPE decides whether it
 * adds to or subtracts from what the driver owes.
 */
function AdjustmentEditor({
  value,
  onChange,
}: {
  value: DraftAdjustment[];
  onChange: (next: DraftAdjustment[]) => void;
}) {
  const add = () =>
    onChange([
      ...value,
      {
        key: crypto.randomUUID(),
        currency: 'LBP',
        direction: 'DEBIT',
        amount: '',
        reason: '',
      },
    ]);

  const update = (key: string, patch: Partial<DraftAdjustment>) =>
    onChange(value.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  return (
    <div className="space-y-2">
      {value.map((adjustment) => (
        <div key={adjustment.key} className="rounded-lg border border-dashed p-3">
          {/* One decision, two options. Every adjustment either adds to what the
              driver owes or takes away from it — and WHY is the sentence below,
              which tells him more than any category label would. */}
          <Segmented
            options={[
              { value: 'DEBIT', label: 'They owe more' },
              { value: 'CREDIT', label: 'They owe less' },
            ]}
            value={adjustment.direction}
            onChange={(next) =>
              update(adjustment.key, { direction: next as AdjustmentDirection })
            }
          />

          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="w-24 space-y-1">
              <Label>Currency</Label>
              <Select
                value={adjustment.currency}
                onValueChange={(next) => update(adjustment.key, { currency: next as Currency })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-28 space-y-1">
              <Label>Amount</Label>
              <Input
                inputMode="decimal"
                className="data-mono"
                value={adjustment.amount}
                onChange={(e) => update(adjustment.key, { amount: e.target.value })}
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Remove adjustment"
              onClick={() => onChange(value.filter((a) => a.key !== adjustment.key))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <div className="mt-2 space-y-1">
            <Label>Reason</Label>
            <Input
              value={adjustment.reason}
              onChange={(e) => update(adjustment.key, { reason: e.target.value })}
              placeholder={
                adjustment.direction === 'DEBIT'
                  ? 'Lost the thermal bag'
                  : 'Bonus — twenty deliveries this week'
              }
            />
          </div>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="size-4" /> Add adjustment
      </Button>
    </div>
  );
}
