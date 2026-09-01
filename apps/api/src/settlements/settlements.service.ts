import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Currency, Prisma } from '@prisma/client';
import {
  CURRENCIES,
  ERROR_CODES,
  adjustmentSignedMinor,
  beirutDayEnd,
  formatMoney,
  toMinorUnits,
  type CreateSettlementInput,
  type DriverOutstandingView,
  type DriverOwedView,
  type OutstandingQuery,
  type SettlementListQuery,
  type SettlementPreviewView,
  type SettlementView,
} from '@loadless/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { offsetArgs, offsetMeta } from '../common/pagination';
import type { AuthUser } from '../auth/auth.types';
import {
  SETTLEMENT_EVENTS,
  type SettlementRecordedEvent,
  type SettlementVoidedEvent,
} from './settlement-events';
import {
  SETTLEMENT_DETAIL_SELECT,
  SETTLEMENT_ORDER_SELECT,
  projectSettlement,
  projectSettlementOrder,
} from './settlement.select';

/**
 * Daily driver settlement — recording the cash a driver hands over at the end
 * of his day.
 *
 * The money story: the driver collects the delivery fee at the door, keeps his
 * earnings and owes the platform its commission. `orders.platformCommissionAmount`
 * (snapshotted atomically at acceptance) is what he owes; this service is the
 * record of it actually being paid.
 *
 * Three things hold the whole design up:
 *
 *  1. A settlement SWEEPS rather than buckets by calendar day. It covers every
 *     unsettled delivered order up to a cutoff instant, so a driver who skips a
 *     day or turns up at 2am is still settled correctly and nothing falls
 *     through a gap.
 *  2. It STAMPS each order it covers with its id. An order therefore belongs to
 *     at most one settlement, forever — which makes double-collection
 *     structurally impossible and keeps every past settlement reconcilable
 *     order by order, even though a reassign can rewrite a live order's
 *     commission snapshot.
 *  3. Currencies NEVER merge. LBP and USD have different exponents and a moving
 *     rate; one set of figures per currency, always.
 */

/** The server-derived part of a settlement, per currency, before adjustments. */
interface SweptCurrency {
  currency: Currency;
  orderCount: number;
  grossCharge: bigint;
  commissionDue: bigint;
}

interface ComputedLine {
  currency: Currency;
  orderCount: number;
  grossCharge: bigint;
  commissionDue: bigint;
  adjustmentsTotal: bigint;
  broughtForward: bigint;
  totalDue: bigint;
  amountCollected: bigint;
  carriedForward: bigint;
}

type Db = PrismaService | Prisma.TransactionClient;

/**
 * "Delivered, and nobody has collected on it yet."
 *
 * Deliberately keyed on status = 'DELIVERED' rather than "the commission
 * snapshot is populated". An admin cancel from PICKED_UP and a FAILED delivery
 * both leave that snapshot set, and neither collected a fee from anyone.
 * Backed by the orders_unsettled_by_driver_idx partial index and by the
 * order_settled_only_when_delivered CHECK.
 */
function unsettledWhere(driverId: string, cutoffAt: Date): Prisma.OrderWhereInput {
  return {
    driverId,
    status: 'DELIVERED',
    settlementId: null,
    deliveredAt: { lte: cutoffAt },
  };
}

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // ------------------------------------------------------------- helpers

  private async sweep(db: Db, driverId: string, cutoffAt: Date): Promise<SweptCurrency[]> {
    const rows = await db.order.groupBy({
      by: ['currency'],
      where: unsettledWhere(driverId, cutoffAt),
      _count: { _all: true },
      _sum: { deliveryCharge: true, platformCommissionAmount: true },
    });
    return rows.map((row) => ({
      currency: row.currency,
      orderCount: row._count._all,
      grossCharge: row._sum.deliveryCharge ?? 0n,
      commissionDue: row._sum.platformCommissionAmount ?? 0n,
    }));
  }

  private async balances(db: Db, driverId: string): Promise<Map<Currency, bigint>> {
    const rows = await db.driverBalance.findMany({
      where: { driverId },
      select: { currency: true, outstanding: true },
    });
    return new Map(rows.map((row) => [row.currency, row.outstanding]));
  }

  /** The previous non-voided settlement — it supplies this one's periodStart. */
  private async previousSettlement(db: Db, driverId: string) {
    return db.driverSettlement.findFirst({
      where: { driverId, status: 'SETTLED' },
      orderBy: [{ settledAt: 'desc' }, { id: 'desc' }],
      select: { id: true, periodEnd: true, settledAt: true },
    });
  }

  private async requireDriver(driverId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true, fullName: true, contactPhone: true },
    });
    if (!driver) throw AppException.notFound('Driver not found');
    return driver;
  }

  /**
   * Who took the cash. Admins have no name column — their login identity is an
   * email — so that is what the receipt shows.
   */
  private async userLabels(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, email: true, driver: { select: { fullName: true } } },
    });
    return new Map(users.map((u) => [u.id, u.driver?.fullName ?? u.email ?? 'Unknown']));
  }

  // ------------------------------------------------------------- preview

  /**
   * What a settlement WOULD be. Persists nothing — the admin reads these
   * figures aloud to the driver before any cash moves.
   */
  async preview(driverId: string, cutoffAt?: Date): Promise<SettlementPreviewView> {
    const driver = await this.requireDriver(driverId);
    const cutoff = cutoffAt ?? new Date();

    const [swept, balances, previous, orders] = await Promise.all([
      this.sweep(this.prisma, driverId, cutoff),
      this.balances(this.prisma, driverId),
      this.previousSettlement(this.prisma, driverId),
      this.prisma.order.findMany({
        where: unsettledWhere(driverId, cutoff),
        select: SETTLEMENT_ORDER_SELECT,
        orderBy: { deliveredAt: 'desc' },
        take: 200,
      }),
    ]);

    const sweptBy = new Map(swept.map((s) => [s.currency, s]));
    const lines = CURRENCIES.flatMap((currency) => {
      const s = sweptBy.get(currency);
      const broughtForward = balances.get(currency) ?? 0n;
      const orderCount = s?.orderCount ?? 0;
      if (orderCount === 0 && broughtForward === 0n) return [];
      const commissionDue = s?.commissionDue ?? 0n;
      return [
        {
          currency,
          orderCount,
          grossCharge: (s?.grossCharge ?? 0n).toString(),
          commissionDue: commissionDue.toString(),
          broughtForward: broughtForward.toString(),
          totalDue: (commissionDue + broughtForward).toString(),
        },
      ];
    });

    return {
      driverId,
      driverName: driver.fullName,
      cutoffAt: cutoff.toISOString(),
      periodStart: previous?.periodEnd.toISOString() ?? null,
      lines,
      orders: orders.map(projectSettlementOrder),
    };
  }

  // -------------------------------------------------------------- settle

  /**
   * Record a cash handover. The one write in this module.
   *
   * Follows the codebase's concurrency rule: one transaction, the full guard in
   * the WHERE of a conditional updateMany, and the socket event emitted only
   * after commit.
   */
  async settle(
    driverId: string,
    input: CreateSettlementInput,
    actor: AuthUser,
  ): Promise<SettlementView> {
    const driver = await this.requireDriver(driverId);
    const cutoffAt = input.cutoffAt;

    if (cutoffAt.getTime() > Date.now()) {
      throw AppException.validation([
        { field: 'cutoffAt', message: 'Cannot settle work that has not happened yet' },
      ]);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // Serialise settlements for THIS driver. The updateMany guard below is
      // what makes double-collection impossible; this lock additionally stops
      // two admins racing on the same brought-forward read and doing the work
      // twice only for one to roll back.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settlement:${driverId}`}))`;

      const previous = await this.previousSettlement(tx, driverId);
      if (previous && cutoffAt <= previous.periodEnd) {
        // Not a validation error: the usual way to land here is two admins
        // settling the same driver at the same moment, where the loser did
        // nothing wrong and simply needs to reload.
        throw AppException.conflict(
          ERROR_CODES.SETTLEMENT_TOTALS_CHANGED,
          'This period has already been settled — reload and try again',
        );
      }

      const [swept, balances] = await Promise.all([
        this.sweep(tx, driverId, cutoffAt),
        this.balances(tx, driverId),
      ]);
      const sweptBy = new Map(swept.map((s) => [s.currency, s]));

      // --- adjustments, converted to signed minor units -------------------
      const adjustmentsBy = new Map<Currency, bigint>();
      const adjustmentRows = input.adjustments.map((adjustment) => {
        const signed = adjustmentSignedMinor(adjustment);
        if (signed === null) {
          throw AppException.validation([
            { field: 'adjustments', message: `Invalid ${adjustment.currency} amount` },
          ]);
        }
        adjustmentsBy.set(
          adjustment.currency,
          (adjustmentsBy.get(adjustment.currency) ?? 0n) + signed,
        );
        return {
          currency: adjustment.currency,
          type: adjustment.type,
          amount: signed,
          reason: adjustment.reason,
          createdByUserId: actor.userId,
        };
      });

      // --- the drift check -------------------------------------------------
      // `expected` is what the preview told the admin, who then said it out
      // loud to the driver. If the driver delivered another order in between,
      // the numbers no longer describe the conversation the two of them had —
      // so refuse, and hand back the fresh figures rather than quietly
      // collecting against a total nobody agreed to.
      this.assertNoDrift(input, sweptBy, balances);

      // --- build the lines --------------------------------------------------
      const collectionsBy = new Map<Currency, bigint>();
      for (const collection of input.collections) {
        const minor = toMinorUnits(collection.amountCollected, collection.currency);
        if (minor === null) {
          throw AppException.validation([
            { field: 'collections', message: `Invalid ${collection.currency} amount` },
          ]);
        }
        collectionsBy.set(collection.currency, minor);
      }

      const lines: ComputedLine[] = [];
      for (const currency of CURRENCIES) {
        const s = sweptBy.get(currency);
        const orderCount = s?.orderCount ?? 0;
        const commissionDue = s?.commissionDue ?? 0n;
        const adjustmentsTotal = adjustmentsBy.get(currency) ?? 0n;
        const broughtForward = balances.get(currency) ?? 0n;
        const amountCollected = collectionsBy.get(currency) ?? 0n;

        // A currency earns a line if it has swept orders, an adjustment, a
        // carried debt, or cash handed over against it. The carried-debt clause
        // is load-bearing: without it a USD debt would vanish from the receipt
        // on a day the driver only ran LBP orders.
        if (
          orderCount === 0 &&
          adjustmentsTotal === 0n &&
          broughtForward === 0n &&
          amountCollected === 0n
        ) {
          continue;
        }

        const totalDue = commissionDue + adjustmentsTotal + broughtForward;
        lines.push({
          currency,
          orderCount,
          grossCharge: s?.grossCharge ?? 0n,
          commissionDue,
          adjustmentsTotal,
          broughtForward,
          totalDue,
          amountCollected,
          carriedForward: totalDue - amountCollected,
        });
      }

      if (lines.length === 0) {
        throw AppException.conflict(
          ERROR_CODES.SETTLEMENT_NOTHING_TO_SETTLE,
          'This driver has nothing outstanding — there is no handover to record',
        );
      }

      const [{ nextval }] = await tx.$queryRaw<[{ nextval: bigint }]>`
        SELECT nextval('settlement_number_seq')`;
      const settlementNumber = `STL-${new Date().getFullYear()}-${String(nextval).padStart(6, '0')}`;

      const settlement = await tx.driverSettlement.create({
        data: {
          settlementNumber,
          driverId,
          periodStart: previous?.periodEnd ?? null,
          periodEnd: cutoffAt,
          collectedByUserId: actor.userId,
          note: input.note,
          lines: { create: lines },
          adjustments: { create: adjustmentRows },
        },
        select: { id: true, settlementNumber: true, settledAt: true },
      });

      // --- stamp the orders: THE guard ------------------------------------
      // `settlementId: null` in the WHERE is what makes collecting the same
      // commission twice impossible. A concurrent settle stamps zero rows, the
      // count check below fails, and the whole transaction rolls back.
      const expectedOrders = lines.reduce((sum, line) => sum + line.orderCount, 0);
      const stamped = await tx.order.updateMany({
        where: unsettledWhere(driverId, cutoffAt),
        data: { settlementId: settlement.id },
      });
      if (stamped.count !== expectedOrders) {
        throw AppException.conflict(
          ERROR_CODES.SETTLEMENT_TOTALS_CHANGED,
          'This driver was settled by someone else a moment ago — reload and try again',
        );
      }

      // --- the running balance --------------------------------------------
      for (const line of lines) {
        await tx.driverBalance.upsert({
          where: { driverId_currency: { driverId, currency: line.currency } },
          create: { driverId, currency: line.currency, outstanding: line.carriedForward },
          update: { outstanding: line.carriedForward },
        });
      }

      return { settlement, lines };
    });

    this.audit.log({
      actor,
      action: 'DRIVER_SETTLEMENT_RECORDED',
      entityType: 'DriverSettlement',
      entityId: result.settlement.id,
      metadata: {
        settlementNumber: result.settlement.settlementNumber,
        driverId,
        driverName: driver.fullName,
        cutoffAt: cutoffAt.toISOString(),
        lines: result.lines.map((line) => ({
          currency: line.currency,
          orderCount: line.orderCount,
          totalDue: line.totalDue.toString(),
          amountCollected: line.amountCollected.toString(),
          carriedForward: line.carriedForward.toString(),
        })),
      },
    });

    this.events.emit(SETTLEMENT_EVENTS.RECORDED, {
      settlementId: result.settlement.id,
      settlementNumber: result.settlement.settlementNumber,
      driverId,
      at: result.settlement.settledAt,
    } satisfies SettlementRecordedEvent);

    return this.get(result.settlement.id);
  }

  /**
   * Refuse the write if the server-derived figures no longer match what the
   * admin was shown. Compares the ORDER + CARRIED-DEBT half only: adjustments
   * are supplied in the same request and recomputed here, so they cannot drift.
   */
  private assertNoDrift(
    input: CreateSettlementInput,
    sweptBy: Map<Currency, SweptCurrency>,
    balances: Map<Currency, bigint>,
  ): void {
    const expectedBy = new Map(input.expected.map((row) => [row.currency, row]));
    const fresh: Array<{ currency: Currency; orderCount: number; totalDue: bigint }> = [];

    for (const currency of CURRENCIES) {
      const s = sweptBy.get(currency);
      const broughtForward = balances.get(currency) ?? 0n;
      const orderCount = s?.orderCount ?? 0;
      if (orderCount === 0 && broughtForward === 0n) continue;
      fresh.push({
        currency,
        orderCount,
        totalDue: (s?.commissionDue ?? 0n) + broughtForward,
      });
    }

    const drifted =
      fresh.length !== expectedBy.size ||
      fresh.some((row) => {
        const expected = expectedBy.get(row.currency);
        if (!expected) return true;
        if (expected.orderCount !== row.orderCount) return true;
        // Minor units on both sides: `expected.totalDue` is this API's own
        // figure echoed back, not something a human typed.
        return BigInt(expected.totalDue) !== row.totalDue;
      });

    if (!drifted) return;

    throw new AppException(
      ERROR_CODES.SETTLEMENT_TOTALS_CHANGED,
      fresh.length === 0
        ? 'This driver has nothing outstanding any more — reload and try again'
        : `The amount owed changed while you were confirming — it is now ${fresh
            .map((row) => formatMoney(row.totalDue, row.currency))
            .join(' and ')}`,
      HttpStatus.CONFLICT,
      fresh.map((row) => ({
        field: row.currency,
        message: `${row.orderCount} order(s), ${formatMoney(row.totalDue, row.currency)} due`,
      })),
    );
  }

  // ---------------------------------------------------------------- void

  /**
   * Reverse a settlement. Nothing is deleted: the row stays in history marked
   * VOIDED with its reason, its orders go back to unsettled, and the balance
   * returns to what it was before.
   */
  async void(settlementId: string, reason: string, actor: AuthUser): Promise<SettlementView> {
    const existing = await this.prisma.driverSettlement.findUnique({
      where: { id: settlementId },
      select: { id: true, driverId: true, status: true, settlementNumber: true },
    });
    if (!existing) throw AppException.notFound('Settlement not found');

    const driverId = existing.driverId;

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`settlement:${driverId}`}))`;

      const settlement = await tx.driverSettlement.findUniqueOrThrow({
        where: { id: settlementId },
        select: {
          id: true,
          status: true,
          settlementNumber: true,
          lines: { select: { currency: true, broughtForward: true } },
        },
      });

      if (settlement.status === 'VOIDED') {
        throw AppException.conflict(
          ERROR_CODES.SETTLEMENT_ALREADY_VOIDED,
          'This settlement has already been voided',
        );
      }

      // Each settlement's brought-forward is the previous one's shortfall, so
      // the chain only unwinds from the end. Voiding an older one would leave
      // every settlement after it describing a balance that never existed.
      const latest = await this.previousSettlement(tx, driverId);
      if (!latest || latest.id !== settlementId) {
        throw AppException.conflict(
          ERROR_CODES.SETTLEMENT_NOT_LATEST,
          'Only the most recent settlement can be voided — void the later ones first',
        );
      }

      const released = await tx.order.updateMany({
        where: { settlementId },
        data: { settlementId: null },
      });

      const voidedAt = new Date();
      const marked = await tx.driverSettlement.updateMany({
        where: { id: settlementId, status: 'SETTLED' },
        data: { status: 'VOIDED', voidedAt, voidedByUserId: actor.userId, voidReason: reason },
      });
      if (marked.count === 0) {
        throw AppException.conflict(
          ERROR_CODES.SETTLEMENT_ALREADY_VOIDED,
          'This settlement has already been voided',
        );
      }

      // Rewind each currency to what it was before this settlement ran.
      for (const line of settlement.lines) {
        await tx.driverBalance.upsert({
          where: { driverId_currency: { driverId, currency: line.currency } },
          create: { driverId, currency: line.currency, outstanding: line.broughtForward },
          update: { outstanding: line.broughtForward },
        });
      }

      this.audit.log({
        actor,
        action: 'DRIVER_SETTLEMENT_VOIDED',
        entityType: 'DriverSettlement',
        entityId: settlementId,
        metadata: {
          settlementNumber: settlement.settlementNumber,
          driverId,
          reason,
          ordersReleased: released.count,
        },
      });

      this.events.emit(SETTLEMENT_EVENTS.VOIDED, {
        settlementId,
        settlementNumber: settlement.settlementNumber,
        driverId,
        at: voidedAt,
      } satisfies SettlementVoidedEvent);
    });

    return this.get(settlementId);
  }

  // ---------------------------------------------------------------- reads

  async get(settlementId: string, driverIdScope?: string): Promise<SettlementView> {
    const settlement = await this.prisma.driverSettlement.findFirst({
      // A driver asking for someone else's receipt gets a 404, not a 403 —
      // confirming it exists would itself leak who settled what.
      where: { id: settlementId, ...(driverIdScope ? { driverId: driverIdScope } : {}) },
      select: SETTLEMENT_DETAIL_SELECT,
    });
    if (!settlement) throw AppException.notFound('Settlement not found');

    const [orders, labels] = await Promise.all([
      this.prisma.order.findMany({
        where: { settlementId },
        select: SETTLEMENT_ORDER_SELECT,
        orderBy: { deliveredAt: 'asc' },
      }),
      this.userLabels([settlement.collectedByUserId]),
    ]);

    return projectSettlement(
      settlement,
      labels.get(settlement.collectedByUserId) ?? null,
      orders,
    );
  }

  async list(query: SettlementListQuery) {
    const where: Prisma.DriverSettlementWhereInput = {
      ...(query.driverId ? { driverId: query.driverId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            settledAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    // Promise.all rather than $transaction([a, b]): the page and its total are
    // not compared to each other on screen, so they need not share a snapshot
    // (and $transaction would run them in series on one connection).
    const [rows, total] = await Promise.all([
      this.prisma.driverSettlement.findMany({
        where,
        select: SETTLEMENT_DETAIL_SELECT,
        orderBy: [{ settledAt: 'desc' }, { id: 'desc' }],
        ...offsetArgs(query),
      }),
      this.prisma.driverSettlement.count({ where }),
    ]);

    const labels = await this.userLabels(rows.map((row) => row.collectedByUserId));

    return {
      data: rows.map((row) => projectSettlement(row, labels.get(row.collectedByUserId) ?? null)),
      meta: offsetMeta(query, total) as unknown as Record<string, unknown>,
    };
  }

  /**
   * The admin's end-of-day worklist: every driver who owes something right now.
   *
   * The groupBy here is safe despite the perf rules on relation counts: it runs
   * against orders_unsettled_by_driver_idx, a PARTIAL index over delivered-and-
   * unsettled orders only. That set is a day's work, not the whole orders
   * table, because settling empties it.
   */
  async outstanding(query: OutstandingQuery) {
    const [orderRows, balanceRows] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['driverId', 'currency'],
        where: { status: 'DELIVERED', settlementId: null, driverId: { not: null } },
        _count: { _all: true },
        _sum: { platformCommissionAmount: true },
      }),
      this.prisma.driverBalance.findMany({
        where: { outstanding: { not: 0n } },
        select: { driverId: true, currency: true, outstanding: true },
      }),
    ]);

    interface Bucket {
      unsettledCommission: bigint;
      unsettledOrderCount: number;
      broughtForward: bigint;
    }
    const byDriver = new Map<string, Map<Currency, Bucket>>();
    const bucket = (driverId: string, currency: Currency): Bucket => {
      let currencies = byDriver.get(driverId);
      if (!currencies) {
        currencies = new Map();
        byDriver.set(driverId, currencies);
      }
      let found = currencies.get(currency);
      if (!found) {
        found = { unsettledCommission: 0n, unsettledOrderCount: 0, broughtForward: 0n };
        currencies.set(currency, found);
      }
      return found;
    };

    for (const row of orderRows) {
      if (!row.driverId) continue;
      const b = bucket(row.driverId, row.currency);
      b.unsettledCommission += row._sum.platformCommissionAmount ?? 0n;
      b.unsettledOrderCount += row._count._all;
    }
    for (const row of balanceRows) {
      bucket(row.driverId, row.currency).broughtForward += row.outstanding;
    }

    const driverIds = [...byDriver.keys()];
    if (driverIds.length === 0) {
      return { data: [] as DriverOutstandingView[], meta: offsetMeta(query, 0) };
    }

    const drivers = await this.prisma.driver.findMany({
      where: {
        id: { in: driverIds },
        ...(query.q ? { fullName: { contains: query.q, mode: 'insensitive' as const } } : {}),
      },
      select: {
        id: true,
        fullName: true,
        contactPhone: true,
        settlements: {
          where: { status: 'SETTLED' },
          orderBy: [{ settledAt: 'desc' }],
          take: 1,
          select: { settledAt: true },
        },
      },
    });

    const views: DriverOutstandingView[] = drivers
      .map((driver) => {
        const currencies = byDriver.get(driver.id) ?? new Map<Currency, Bucket>();
        return {
          driverId: driver.id,
          driverName: driver.fullName,
          contactPhone: driver.contactPhone,
          lines: CURRENCIES.flatMap((currency) => {
            const b = currencies.get(currency);
            if (!b) return [];
            if (b.unsettledOrderCount === 0 && b.broughtForward === 0n) return [];
            return [
              {
                currency,
                unsettledCommission: b.unsettledCommission.toString(),
                unsettledOrderCount: b.unsettledOrderCount,
                broughtForward: b.broughtForward.toString(),
                totalDue: (b.unsettledCommission + b.broughtForward).toString(),
              },
            ];
          }),
          lastSettledAt: driver.settlements[0]?.settledAt.toISOString() ?? null,
        };
      })
      .filter((view) => view.lines.length > 0)
      // Most uncollected deliveries first — a currency-agnostic ordering, since
      // ranking by amount would mean comparing LBP against USD.
      .sort((a, b) => {
        const count = (v: DriverOutstandingView) =>
          v.lines.reduce((sum, line) => sum + line.unsettledOrderCount, 0);
        return count(b) - count(a) || a.driverName.localeCompare(b.driverName);
      });

    const { skip, take } = offsetArgs(query);
    return {
      data: views.slice(skip, skip + take),
      meta: offsetMeta(query, views.length),
    };
  }

  /**
   * The driver's own answer to "how much is on me right now?" — the same
   * figures the admin will collect against, so there is nothing to argue about
   * when the two of them are standing together.
   */
  async owedByDriver(driverId: string): Promise<DriverOwedView> {
    const cutoff = new Date();
    const [swept, balances, previous] = await Promise.all([
      this.sweep(this.prisma, driverId, cutoff),
      this.balances(this.prisma, driverId),
      this.previousSettlement(this.prisma, driverId),
    ]);

    const sweptBy = new Map(swept.map((s) => [s.currency, s]));
    const lines = CURRENCIES.flatMap((currency) => {
      const s = sweptBy.get(currency);
      const broughtForward = balances.get(currency) ?? 0n;
      const orderCount = s?.orderCount ?? 0;
      if (orderCount === 0 && broughtForward === 0n) return [];
      const unsettledCommission = s?.commissionDue ?? 0n;
      return [
        {
          currency,
          unsettledCommission: unsettledCommission.toString(),
          unsettledOrderCount: orderCount,
          broughtForward: broughtForward.toString(),
          totalDue: (unsettledCommission + broughtForward).toString(),
        },
      ];
    });

    return {
      lines,
      clear: lines.length === 0,
      lastSettledAt: previous?.settledAt.toISOString() ?? null,
    };
  }

  async listForDriver(driverId: string, query: SettlementListQuery) {
    return this.list({ ...query, driverId });
  }

  /** Default cut-off for the settle dialog: the end of today, in Beirut. */
  defaultCutoff(): Date {
    const endOfDay = beirutDayEnd();
    const now = new Date();
    return endOfDay > now ? now : endOfDay;
  }
}
