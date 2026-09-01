import type { Currency } from '@prisma/client';
import type {
  SettlementAdjustmentView,
  SettlementLineView,
  SettlementOrderView,
  SettlementView,
} from '@loadless/shared';

/**
 * Projection for settlement reads. Every money column crosses the wire as a
 * string (the global interceptor stringifies BigInt), and every figure stays
 * attached to its own currency — nothing here is ever merged across currencies.
 */
export const SETTLEMENT_DETAIL_SELECT = {
  id: true,
  settlementNumber: true,
  driverId: true,
  status: true,
  periodStart: true,
  periodEnd: true,
  settledAt: true,
  note: true,
  voidedAt: true,
  voidReason: true,
  collectedByUserId: true,
  driver: { select: { fullName: true } },
  lines: {
    select: {
      currency: true,
      orderCount: true,
      grossCharge: true,
      commissionDue: true,
      adjustmentsTotal: true,
      broughtForward: true,
      totalDue: true,
      amountCollected: true,
      carriedForward: true,
    },
    orderBy: { currency: 'asc' },
  },
  adjustments: {
    select: {
      id: true,
      currency: true,
      amount: true,
      reason: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  },
} as const;

export const SETTLEMENT_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  currency: true,
  deliveryCharge: true,
  // The rate is what turns a list of amounts into an explanation: charge x rate
  // = commission, checkable on the spot by the person being charged.
  commissionBps: true,
  platformCommissionAmount: true,
  driverEarnings: true,
  deliveredAt: true,
} as const;

interface RawLine {
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

interface RawAdjustment {
  id: string;
  currency: Currency;
  amount: bigint;
  reason: string;
  createdAt: Date;
}

interface RawOrder {
  id: string;
  orderNumber: string;
  currency: Currency;
  deliveryCharge: bigint;
  commissionBps: number | null;
  platformCommissionAmount: bigint | null;
  driverEarnings: bigint | null;
  deliveredAt: Date | null;
}

export function projectLine(line: RawLine): SettlementLineView {
  return {
    currency: line.currency,
    orderCount: line.orderCount,
    grossCharge: line.grossCharge.toString(),
    commissionDue: line.commissionDue.toString(),
    adjustmentsTotal: line.adjustmentsTotal.toString(),
    broughtForward: line.broughtForward.toString(),
    totalDue: line.totalDue.toString(),
    amountCollected: line.amountCollected.toString(),
    carriedForward: line.carriedForward.toString(),
  };
}

export function projectAdjustment(adjustment: RawAdjustment): SettlementAdjustmentView {
  return {
    id: adjustment.id,
    currency: adjustment.currency,
    // The signed amount IS the record; direction is only how a human reads it.
    direction: adjustment.amount >= 0n ? 'DEBIT' : 'CREDIT',
    amount: adjustment.amount.toString(),
    reason: adjustment.reason,
    createdAt: adjustment.createdAt.toISOString(),
  };
}

export function projectSettlementOrder(order: RawOrder): SettlementOrderView {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    currency: order.currency,
    deliveryCharge: order.deliveryCharge.toString(),
    commissionBps: order.commissionBps ?? 0,
    platformCommissionAmount: (order.platformCommissionAmount ?? 0n).toString(),
    driverEarnings: (order.driverEarnings ?? 0n).toString(),
    // A settleable order is always DELIVERED, and order_delivered_has_timestamp
    // makes the timestamp structural, so this fallback is unreachable.
    deliveredAt: (order.deliveredAt ?? new Date(0)).toISOString(),
  };
}

interface RawSettlement {
  id: string;
  settlementNumber: string;
  driverId: string;
  status: 'SETTLED' | 'VOIDED';
  periodStart: Date | null;
  periodEnd: Date;
  settledAt: Date;
  note: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
  driver: { fullName: string };
  lines: RawLine[];
  adjustments: RawAdjustment[];
}

export function projectSettlement(
  settlement: RawSettlement,
  collectedByName: string | null,
  orders?: RawOrder[],
): SettlementView {
  return {
    id: settlement.id,
    settlementNumber: settlement.settlementNumber,
    driverId: settlement.driverId,
    driverName: settlement.driver.fullName,
    status: settlement.status,
    periodStart: settlement.periodStart?.toISOString() ?? null,
    periodEnd: settlement.periodEnd.toISOString(),
    settledAt: settlement.settledAt.toISOString(),
    collectedByName,
    note: settlement.note,
    voidedAt: settlement.voidedAt?.toISOString() ?? null,
    voidReason: settlement.voidReason,
    lines: settlement.lines.map(projectLine),
    adjustments: settlement.adjustments.map(projectAdjustment),
    ...(orders ? { orders: orders.map(projectSettlementOrder) } : {}),
  };
}
