'use client';

import { formatMoney } from '@loadless/shared';
import { displayRelative } from '@/lib/format';
import type { CustomerStats } from '../api';

function Cell({
  id,
  label,
  children,
}: {
  /** Stable across scopes — the visible label is not (it changes for admin). */
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3" data-testid={`stat-${id}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1" data-testid={`stat-${id}-value`}>
        {children}
      </div>
    </div>
  );
}

/** The credibility read: is this a regular, and how much do they spend with us? */
export function StatStrip({ stats }: { stats: CustomerStats }) {
  return (
    <div className="grid grid-cols-2 divide-x divide-y border-y bg-muted/30 sm:grid-cols-4 sm:divide-y-0">
      <Cell id="orders" label={stats.scope === 'PLATFORM' ? 'Orders' : 'Orders with you'}>
        <p className="data-mono text-xl font-bold leading-none">{stats.ordersInScope}</p>
      </Cell>
      <Cell id="last-order" label="Last order">
        <p className="text-sm font-semibold leading-none">
          {stats.lastOrderAt ? displayRelative(stats.lastOrderAt) : '—'}
        </p>
      </Cell>
      <Cell id="delivered" label="Delivered">
        <p className="data-mono text-xl font-bold leading-none">{stats.delivered}</p>
        {(stats.cancelled > 0 || stats.failed > 0) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.failed > 0 && `${stats.failed} failed`}
            {stats.failed > 0 && stats.cancelled > 0 && ' · '}
            {stats.cancelled > 0 && `${stats.cancelled} cancelled`}
          </p>
        )}
      </Cell>
      <Cell id="spend" label={stats.scope === 'PLATFORM' ? 'Delivered value' : 'Spent with you'}>
        {stats.deliveredSpend.length === 0 ? (
          <p className="data-mono text-xl font-bold leading-none">—</p>
        ) : (
          stats.deliveredSpend.map((row) => (
            <p key={row.currency} className="data-mono text-base font-bold leading-tight">
              {formatMoney(row.amount, row.currency)}
            </p>
          ))
        )}
      </Cell>
    </div>
  );
}
