'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OrderStatus } from '@loadless/shared';
import { STATUS_META } from '@/features/orders/order-status';
import type { AdminDashboard } from './api';

/**
 * dataviz-skill compliant: one axis, thin rounded marks with surface gaps,
 * recessive grid, legend for multi-series, text in text tokens (identity is
 * carried by the mark beside the label, never by coloring the text).
 */

const tooltipStyle = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--popover-foreground)',
};

export function DailyOrdersChart({ data }: { data: AdminDashboard['dailySeries'] }) {
  const series = data.map((d) => ({
    ...d,
    label: new Date(`${d.day}T00:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
    }),
  }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barGap={2}>
        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
        <Legend
          formatter={(value: string) => (
            <span style={{ color: 'var(--muted-foreground)', fontSize: 12 }}>{value}</span>
          )}
        />
        <Bar name="Delivered" dataKey="delivered" fill="var(--chart-delivered)" radius={[4, 4, 0, 0]} maxBarSize={16} />
        <Bar name="Created" dataKey="created" fill="var(--chart-created)" radius={[4, 4, 0, 0]} maxBarSize={16} />
        <Bar
          name="Failed / cancelled"
          dataKey="failedOrCancelled"
          fill="var(--chart-failed)"
          radius={[4, 4, 0, 0]}
          maxBarSize={16}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

const BREAKDOWN_ORDER: OrderStatus[] = [
  'PENDING',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
];

/** Status counts as labeled horizontal bars — status colors used for STATES (their reserved job). */
export function StatusBreakdown({ counts }: { counts: Partial<Record<OrderStatus, number>> }) {
  const total = BREAKDOWN_ORDER.reduce((sum, s) => sum + (counts[s] ?? 0), 0);
  if (total === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No orders this week yet.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {BREAKDOWN_ORDER.map((status) => {
        const count = counts[status] ?? 0;
        if (count === 0) return null;
        const meta = STATUS_META[status];
        return (
          <li key={status} className="flex items-center gap-3">
            <span className="flex w-36 items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`size-2 rounded-full ${meta.dotClass}`} aria-hidden />
              {meta.label}
            </span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${meta.railClass}`}
                style={{ width: `${Math.max(3, (count / total) * 100)}%` }}
              />
            </div>
            <span className="data-mono w-10 text-right text-xs font-semibold">{count}</span>
          </li>
        );
      })}
    </ul>
  );
}
