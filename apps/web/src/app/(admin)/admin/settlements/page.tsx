'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import type { DriverOutstandingView } from '@loadless/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pagination } from '@/components/pagination';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { displayDateTime, displayMoney } from '@/lib/format';
import { useOutstanding, useSettlements } from '@/features/admin/settlements/api';
import { SettleDialog } from '@/features/admin/settlements/settle-dialog';

/**
 * End of day. Who still has the platform's money on them, and the record of
 * everyone who has already handed theirs over.
 */
export default function SettlementsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search, 300);
  const [settling, setSettling] = useState<{ id: string; name: string } | null>(null);

  const { data, isPending } = useOutstanding(page, q);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Settlements</h1>
          <p className="text-sm text-muted-foreground">
            Commission collected from drivers at the end of their day.
          </p>
        </div>
        <Input
          className="w-full sm:w-64"
          placeholder="Search drivers"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <section className="space-y-3">
        {/* Not "Outstanding": a negative balance means the driver OVERPAID and
            the platform owes him. Filing that under "outstanding", as a
            negative amount in a column headed "Owed", said the opposite of the
            truth about somebody's money. */}
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Open balances
        </h2>

        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : data && data.data.length > 0 ? (
          <>
            {/* Named so the two tables on this page are tellable apart: both
                list driver names, and an unscoped row query matches either. */}
            <Table aria-label="Drivers with an open balance">
              <TableHeader>
                <TableRow>
                  <TableHead>Driver</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead className="text-right">Deliveries</TableHead>
                  <TableHead>Last settled</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((row) => (
                  <OutstandingRow
                    key={row.driverId}
                    row={row}
                    onSettle={() => setSettling({ id: row.driverId, name: row.driverName })}
                  />
                ))}
              </TableBody>
            </Table>
            <Pagination meta={data.meta} onPageChange={setPage} />
          </>
        ) : (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <Wallet className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-medium">Everyone is square</p>
            <p className="text-sm text-muted-foreground">
              No driver is holding the platform&apos;s commission right now.
            </p>
          </div>
        )}
      </section>

      <SettlementHistory />

      <SettleDialog
        driverId={settling?.id ?? null}
        driverName={settling?.name ?? ''}
        open={settling !== null}
        onOpenChange={(open) => !open && setSettling(null)}
      />
    </div>
  );
}

function OutstandingRow({
  row,
  onSettle,
}: {
  row: DriverOutstandingView;
  onSettle: () => void;
}) {
  const deliveries = row.lines.reduce((sum, line) => sum + line.unsettledOrderCount, 0);
  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{row.driverName}</div>
        <div className="text-xs text-muted-foreground">{row.contactPhone}</div>
      </TableCell>
      <TableCell>
        {/* One amount per currency, stacked. LBP and USD are never added up. */}
        <div className="space-y-0.5">
          {row.lines.map((line) => {
            const due = BigInt(line.totalDue);
            const carried = BigInt(line.broughtForward);
            return (
              <div key={line.currency} className="flex flex-wrap items-center gap-2">
                {due < 0n ? (
                  // Read it out the way it actually is, rather than showing a
                  // minus sign under a column that claims he owes it.
                  <span className="data-mono font-medium text-accent">
                    {displayMoney(-due, line.currency)} in credit
                  </span>
                ) : (
                  <span className="data-mono font-medium">
                    {displayMoney(due, line.currency)}
                  </span>
                )}
                {carried > 0n && (
                  <Badge variant="warning">
                    carried {displayMoney(carried, line.currency)}
                  </Badge>
                )}
                {carried < 0n && (
                  <Badge variant="accent">
                    overpaid {displayMoney(-carried, line.currency)}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      </TableCell>
      <TableCell className="data-mono text-right">{deliveries}</TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {row.lastSettledAt ? displayDateTime(row.lastSettledAt) : 'Never'}
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" onClick={onSettle}>
          Settle
        </Button>
      </TableCell>
    </TableRow>
  );
}

function SettlementHistory() {
  const [page, setPage] = useState(1);
  const { data, isPending } = useSettlements(page);

  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (!data || data.data.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Recent settlements
      </h2>
      <Table aria-label="Recent settlements">
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Collected</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Taken by</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.data.map((settlement) => (
            <TableRow key={settlement.id}>
              <TableCell>
                <Link
                  href={`/admin/settlements/${settlement.id}`}
                  className="data-mono font-medium hover:underline"
                >
                  {settlement.settlementNumber}
                </Link>
                {settlement.status === 'VOIDED' && (
                  <Badge variant="destructive" className="ml-2">
                    Voided
                  </Badge>
                )}
              </TableCell>
              <TableCell>{settlement.driverName}</TableCell>
              <TableCell>
                <div className="space-y-0.5">
                  {settlement.lines.map((line) => (
                    <div key={line.currency} className="data-mono text-sm">
                      {displayMoney(line.amountCollected, line.currency)}
                      {BigInt(line.carriedForward) !== 0n && (
                        <span className="ml-2 text-xs text-warning">
                          short {displayMoney(line.carriedForward, line.currency)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {displayDateTime(settlement.settledAt)}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {settlement.collectedByName ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination meta={data.meta} onPageChange={setPage} />
    </section>
  );
}
