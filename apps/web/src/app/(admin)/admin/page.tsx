'use client';

import { formatMoney } from '@loadless/shared';
import { Bike, PackageOpen, Store, Timer } from 'lucide-react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminDashboard, type DeliveredSums } from '@/features/admin/dashboard/api';

const DailyOrdersChart = dynamic(
  () => import('@/features/admin/dashboard/charts').then((m) => m.DailyOrdersChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);
const StatusBreakdown = dynamic(
  () => import('@/features/admin/dashboard/charts').then((m) => m.StatusBreakdown),
  { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> },
);

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function StatTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="data-mono mt-1 text-3xl font-bold">{value}</p>
        </div>
        <div
          className={`flex size-10 items-center justify-center rounded-lg ${
            accent ? 'bg-accent/15 text-accent' : 'bg-primary/10 text-primary'
          }`}
        >
          <Icon className="size-5" aria-hidden />
        </div>
      </CardContent>
    </Card>
  );
}

function MoneyRows({ sums, field }: { sums: DeliveredSums[]; field: keyof DeliveredSums }) {
  if (sums.length === 0) return <p className="data-mono text-2xl font-bold">—</p>;
  return (
    <div className="space-y-0.5">
      {sums.map((row) => (
        <p key={row.currency} className="data-mono text-xl font-bold leading-tight">
          {formatMoney(row[field] as string, row.currency)}
        </p>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { data, isPending } = useAdminDashboard();

  if (isPending || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const openOrders =
    (data.open.PENDING ?? 0) + (data.open.DRIVER_ASSIGNED ?? 0) + (data.open.PICKED_UP ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Live platform overview — updates in real time.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Open orders" value={openOrders} icon={PackageOpen} accent={openOrders > 0} />
        <StatTile label="On-duty drivers" value={data.onDutyDrivers} icon={Bike} />
        <StatTile label="Active vendors" value={data.activeVendors} icon={Store} />
        <StatTile
          label="Avg time to assign (7d)"
          value={formatDuration(data.avgAssignSeconds)}
          icon={Timer}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Platform commission · today
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MoneyRows sums={data.deliveredToday} field="platformCommission" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Platform commission · 7 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MoneyRows sums={data.deliveredWeek} field="platformCommission" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Delivery volume · 7 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MoneyRows sums={data.deliveredWeek} field="deliveryVolume" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Orders — last 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyOrdersChart data={data.dailySeries} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">This week by status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBreakdown counts={data.week} />
            <p className="mt-4 text-xs text-muted-foreground">
              Avg time to deliver (7d): {formatDuration(data.avgDeliverSeconds)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
