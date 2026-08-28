import { Injectable } from '@nestjs/common';
import type { Currency, OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Read-only aggregates. All sums run in SQL (never fetch-rows-then-add), all
 * money is grouped by currency (LBP and USD are NEVER merged), and dashboard
 * reads are cached (30s TTL) — analytics is the one place freshness-tolerant
 * caching is allowed.
 */

export interface MoneyByCurrency {
  currency: Currency;
  amount: string; // BigInt as string
}

interface DeliveredSums {
  currency: Currency;
  deliveredCount: number;
  deliveryVolume: string;
  platformCommission: string;
  driverEarnings: string;
}

const DASHBOARD_CACHE_KEY = 'cache:analytics:admin-dashboard';
const DASHBOARD_TTL_SECONDS = 30;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ----------------------------------------------------------------- admin

  async adminDashboard() {
    const cached = await this.redis.getJson<Record<string, unknown>>(DASHBOARD_CACHE_KEY);
    if (cached) return cached;

    const today = startOfToday();
    const week = daysAgo(7);

    const [
      openByStatus,
      todayByStatus,
      weekByStatus,
      deliveredToday,
      deliveredWeek,
      onDutyDrivers,
      activeVendors,
      timings,
      dailySeries,
    ] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        where: { status: { in: ['PENDING', 'DRIVER_ASSIGNED', 'PICKED_UP'] } },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { createdAt: { gte: today } },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { createdAt: { gte: week } },
        _count: { _all: true },
      }),
      this.deliveredSums({ deliveredAt: { gte: today } }),
      this.deliveredSums({ deliveredAt: { gte: week } }),
      this.prisma.driver.count({ where: { dutyStatus: 'ON_DUTY', status: 'ACTIVE' } }),
      this.prisma.vendor.count({ where: { status: 'ACTIVE' } }),
      this.prisma.$queryRaw<
        [{ avg_assign_secs: number | null; avg_deliver_secs: number | null }]
      >`SELECT
          AVG(EXTRACT(EPOCH FROM (assigned_at - created_at))) AS avg_assign_secs,
          AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))) AS avg_deliver_secs
        FROM orders
        WHERE created_at >= ${week} AND assigned_at IS NOT NULL`,
      this.prisma.$queryRaw<
        Array<{ day: Date; created: bigint; delivered: bigint; failed_or_cancelled: bigint }>
      >`SELECT
          date_trunc('day', created_at) AS day,
          COUNT(*) AS created,
          COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
          COUNT(*) FILTER (WHERE status IN ('FAILED','CANCELLED')) AS failed_or_cancelled
        FROM orders
        WHERE created_at >= ${daysAgo(14)}
        GROUP BY 1 ORDER BY 1`,
    ]);

    const toStatusMap = (rows: Array<{ status: OrderStatus; _count: { _all: number } }>) =>
      Object.fromEntries(rows.map((r) => [r.status, r._count._all]));

    const result = {
      open: toStatusMap(openByStatus),
      today: toStatusMap(todayByStatus),
      week: toStatusMap(weekByStatus),
      deliveredToday,
      deliveredWeek,
      onDutyDrivers,
      activeVendors,
      avgAssignSeconds: timings[0]?.avg_assign_secs ? Math.round(timings[0].avg_assign_secs) : null,
      avgDeliverSeconds: timings[0]?.avg_deliver_secs ? Math.round(timings[0].avg_deliver_secs) : null,
      dailySeries: dailySeries.map((row) => ({
        day: row.day.toISOString().slice(0, 10),
        created: Number(row.created),
        delivered: Number(row.delivered),
        failedOrCancelled: Number(row.failed_or_cancelled),
      })),
      generatedAt: new Date().toISOString(),
    };

    await this.redis.setJson(DASHBOARD_CACHE_KEY, result, DASHBOARD_TTL_SECONDS);
    return result;
  }

  private async deliveredSums(where: { deliveredAt: { gte: Date; lte?: Date } }): Promise<DeliveredSums[]> {
    const rows = await this.prisma.order.groupBy({
      by: ['currency'],
      where: { status: 'DELIVERED', ...where },
      _count: { _all: true },
      _sum: { deliveryCharge: true, platformCommissionAmount: true, driverEarnings: true },
    });
    return rows.map((row) => ({
      currency: row.currency,
      deliveredCount: row._count._all,
      deliveryVolume: (row._sum.deliveryCharge ?? 0n).toString(),
      platformCommission: (row._sum.platformCommissionAmount ?? 0n).toString(),
      driverEarnings: (row._sum.driverEarnings ?? 0n).toString(),
    }));
  }

  // ---------------------------------------------------------------- vendor

  async vendorStats(vendorId: string, from?: Date, to?: Date) {
    const createdRange = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
    const where = { vendorId, ...(from || to ? { createdAt: createdRange } : {}) };

    const [byStatus, volume] = await Promise.all([
      this.prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
      this.prisma.order.groupBy({
        by: ['currency'],
        where: { ...where, status: 'DELIVERED' },
        _count: { _all: true },
        _sum: { deliveryCharge: true },
      }),
    ]);
    return {
      byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      delivered: volume.map((row) => ({
        currency: row.currency,
        count: row._count._all,
        deliveryVolume: (row._sum.deliveryCharge ?? 0n).toString(),
      })),
    };
  }

  // ---------------------------------------------------------------- driver

  async driverEarnings(driverId: string, from?: Date, to?: Date) {
    const sums = (gte: Date, lte?: Date) =>
      this.prisma.order.groupBy({
        by: ['currency'],
        where: {
          driverId,
          status: 'DELIVERED',
          deliveredAt: { gte, ...(lte ? { lte } : {}) },
        },
        _count: { _all: true },
        _sum: { driverEarnings: true },
      });

    const [today, week, range, failedWeek] = await Promise.all([
      sums(startOfToday()),
      sums(daysAgo(7)),
      from ? sums(from, to) : Promise.resolve(null),
      this.prisma.order.count({
        where: { driverId, status: 'FAILED', createdAt: { gte: daysAgo(7) } },
      }),
    ]);

    const shape = (rows: Awaited<ReturnType<typeof sums>>) =>
      rows.map((row) => ({
        currency: row.currency,
        deliveries: row._count._all,
        earnings: (row._sum.driverEarnings ?? 0n).toString(),
      }));

    return {
      today: shape(today),
      week: shape(week),
      range: range ? shape(range) : null,
      failedThisWeek: failedWeek,
    };
  }

  // --------------------------------------------------------- driver report

  async driverPerformance(from?: Date, to?: Date) {
    const where = {
      status: 'DELIVERED' as const,
      ...(from || to
        ? { deliveredAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    };
    const [delivered, drivers] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['driverId', 'currency'],
        where,
        _count: { _all: true },
        _sum: { driverEarnings: true, platformCommissionAmount: true },
      }),
      this.prisma.driver.findMany({ select: { id: true, fullName: true } }),
    ]);
    const names = new Map(drivers.map((d) => [d.id, d.fullName]));
    return delivered.map((row) => ({
      driverId: row.driverId,
      driverName: names.get(row.driverId as string) ?? 'Unknown',
      currency: row.currency,
      deliveries: row._count._all,
      earnings: (row._sum.driverEarnings ?? 0n).toString(),
      platformCommission: (row._sum.platformCommissionAmount ?? 0n).toString(),
    }));
  }
}
