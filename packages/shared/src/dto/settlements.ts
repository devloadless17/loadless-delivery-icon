import { z } from 'zod';
import {
  ADJUSTMENT_DIRECTION_BY_TYPE,
  ADJUSTMENT_DIRECTIONS,
  ADJUSTMENT_TYPES,
  SETTLEMENT_STATUSES,
  type AdjustmentDirection,
  type AdjustmentType,
} from '../enums';
import { CURRENCIES, toMinorUnits, type Currency } from '../money';
import { cuidSchema, offsetPaginationSchema, reasonSchema } from './common';

/**
 * Daily driver settlement — the driver hands the platform its commission in cash.
 *
 * Every amount crosses the wire as a MAJOR-unit string exactly as a human typed
 * it ("45000", "12.50"), paired with its own currency, and is converted with the
 * shared toMinorUnits. Nothing here is ever summed across currencies: LBP and
 * USD have different exponents and a moving exchange rate, so a merged total
 * would be a fiction. One set of figures per currency, always.
 */

const majorAmount = z.string().trim().min(1).max(24);

/** A typed amount that must parse cleanly in its own currency. */
function refineAmount(
  value: { currency: Currency; amount: string },
  ctx: z.RefinementCtx,
  { allowZero }: { allowZero: boolean },
): bigint | null {
  const minor = toMinorUnits(value.amount, value.currency);
  if (minor === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['amount'],
      message: `Enter a valid ${value.currency} amount`,
    });
    return null;
  }
  if (!allowZero && minor === 0n) {
    ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Amount must be more than zero' });
    return null;
  }
  return minor;
}

// ---------- adjustments ----------

export const settlementAdjustmentSchema = z
  .object({
    currency: z.enum(CURRENCIES),
    type: z.enum(ADJUSTMENT_TYPES),
    direction: z.enum(ADJUSTMENT_DIRECTIONS),
    /** Always a positive magnitude — the sign comes from `direction`. */
    amount: majorAmount,
    reason: reasonSchema,
  })
  .superRefine((value, ctx) => {
    refineAmount(value, ctx, { allowZero: false });
    if (!ADJUSTMENT_DIRECTION_BY_TYPE[value.type].includes(value.direction)) {
      ctx.addIssue({
        code: 'custom',
        path: ['direction'],
        message: `A ${value.type.toLowerCase()} cannot be a ${value.direction.toLowerCase()}`,
      });
    }
  });
export type SettlementAdjustmentInput = z.infer<typeof settlementAdjustmentSchema>;

/**
 * An adjustment as signed minor units, in "what the driver owes" terms:
 * positive increases the debt, negative reduces it. The ONLY place that sign
 * is applied — the API stores it and the UI previews with it.
 */
export function adjustmentSignedMinor(input: {
  currency: Currency;
  direction: AdjustmentDirection;
  amount: string;
}): bigint | null {
  const minor = toMinorUnits(input.amount, input.currency);
  if (minor === null) return null;
  return input.direction === 'DEBIT' ? minor : -minor;
}

/** The default direction for a type, for pre-filling the form. */
export function defaultDirectionFor(type: AdjustmentType): AdjustmentDirection {
  return ADJUSTMENT_DIRECTION_BY_TYPE[type][0]!;
}

// ---------- recording a settlement ----------

const uniqueByCurrency = <T extends { currency: Currency }>(rows: T[]) =>
  new Set(rows.map((r) => r.currency)).size === rows.length;

/**
 * What the admin agreed with the driver, echoed back from the preview.
 *
 * The driver may deliver another order in the seconds between the admin reading
 * the total aloud and tapping Confirm. Rather than silently collecting against
 * a number nobody agreed to, the server re-computes and refuses the write if
 * these figures have moved (SETTLEMENT_TOTALS_CHANGED).
 */
/**
 * Amounts in this file come in two flavours, and mixing them up is invisible in
 * LBP (exponent 0) while being wrong by a factor of 100 in USD:
 *
 *   - HUMAN input — what an admin types into a box ("45000", "12.50"). Parsed
 *     with the shared toMinorUnits, which is currency-aware.
 *   - ECHOED server values — figures this API itself just emitted, which cross
 *     the wire as MINOR units already (the BigInt-as-string convention).
 *     Re-parsing one as human input would multiply every USD figure by 100.
 *
 * `minorAmount` marks the second kind.
 */
const minorAmount = z
  .string()
  .trim()
  .regex(/^-?\d{1,24}$/, 'Expected a minor-unit integer');

export const expectedLineSchema = z.object({
  currency: z.enum(CURRENCIES),
  orderCount: z.number().int().min(0),
  /**
   * commissionDue + broughtForward in MINOR units, exactly as the preview
   * reported it — the SERVER-derived part only, echoed straight back.
   * Adjustments are chosen in the dialog after the preview, so the server
   * recomputes those from the submitted list and they cannot drift.
   * May be negative: a driver who overpaid last time is in credit.
   */
  totalDue: minorAmount,
});

export const collectionSchema = z.object({
  currency: z.enum(CURRENCIES),
  /** What the driver actually handed over. May be short, may be zero. */
  amountCollected: majorAmount,
});

export const createSettlementSchema = z
  .object({
    /**
     * Settle everything delivered up to this instant. Defaults to now on the
     * client; backdating to the end of a previous Beirut day is allowed.
     */
    cutoffAt: z.coerce.date(),
    /**
     * May be empty: recording a fine against a driver who owes nothing is a
     * real handover. "There is genuinely nothing to settle" is the server's
     * call, not the schema's — it answers with SETTLEMENT_NOTHING_TO_SETTLE so
     * the UI can say why, rather than a shapeless validation error.
     */
    expected: z.array(expectedLineSchema).max(CURRENCIES.length),
    collections: z.array(collectionSchema).max(CURRENCIES.length).default([]),
    adjustments: z.array(settlementAdjustmentSchema).max(20).default([]),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((value, ctx) => {
    if (!uniqueByCurrency(value.expected)) {
      ctx.addIssue({ code: 'custom', path: ['expected'], message: 'One row per currency' });
    }
    if (!uniqueByCurrency(value.collections)) {
      ctx.addIssue({ code: 'custom', path: ['collections'], message: 'One row per currency' });
    }
    value.collections.forEach((row, i) => {
      const minor = toMinorUnits(row.amountCollected, row.currency);
      if (minor === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['collections', i, 'amountCollected'],
          message: `Enter a valid ${row.currency} amount`,
        });
      }
    });
    // Collecting in a currency that will have no line is a mis-tap, not a
    // settlement — the server would have nothing to attach the cash to. A
    // currency can earn a line either from swept orders/carried debt (which is
    // what `expected` echoes) or from an adjustment added in this same dialog.
    const settleable = new Set([
      ...value.expected.map((r) => r.currency),
      ...value.adjustments.map((r) => r.currency),
    ]);
    value.collections.forEach((row, i) => {
      if (!settleable.has(row.currency)) {
        ctx.addIssue({
          code: 'custom',
          path: ['collections', i, 'currency'],
          message: `Nothing is owed in ${row.currency}`,
        });
      }
    });
  });
export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;

export const voidSettlementSchema = z.object({ reason: reasonSchema });
export type VoidSettlementInput = z.infer<typeof voidSettlementSchema>;

export const settlementPreviewQuerySchema = z.object({
  cutoffAt: z.coerce.date().optional(),
});
export type SettlementPreviewQuery = z.infer<typeof settlementPreviewQuerySchema>;

export const settlementListQuerySchema = offsetPaginationSchema.extend({
  driverId: cuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(SETTLEMENT_STATUSES).optional(),
});
export type SettlementListQuery = z.infer<typeof settlementListQuerySchema>;

export const outstandingQuerySchema = offsetPaginationSchema.extend({
  q: z.string().trim().max(120).optional(),
});
export type OutstandingQuery = z.infer<typeof outstandingQuerySchema>;

// ---------- views (all money is BigInt serialised as a string) ----------

export interface SettlementLineView {
  currency: Currency;
  orderCount: number;
  grossCharge: string;
  commissionDue: string;
  adjustmentsTotal: string;
  broughtForward: string;
  totalDue: string;
  amountCollected: string;
  /** Signed. Positive = still owed, negative = the driver is in credit. */
  carriedForward: string;
}

export interface SettlementAdjustmentView {
  id: string;
  currency: Currency;
  type: AdjustmentType;
  direction: AdjustmentDirection;
  /** Signed minor units, in "what the driver owes" terms. */
  amount: string;
  reason: string;
  createdAt: string;
}

export interface SettlementOrderView {
  id: string;
  orderNumber: string;
  currency: Currency;
  deliveryCharge: string;
  platformCommissionAmount: string;
  deliveredAt: string;
}

export interface SettlementView {
  id: string;
  settlementNumber: string;
  driverId: string;
  driverName: string;
  status: (typeof SETTLEMENT_STATUSES)[number];
  periodStart: string | null;
  periodEnd: string;
  settledAt: string;
  collectedByName: string | null;
  note: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  lines: SettlementLineView[];
  adjustments: SettlementAdjustmentView[];
  orders?: SettlementOrderView[];
}

/** What a settlement WOULD look like — computed, never stored. */
export interface SettlementPreviewView {
  driverId: string;
  driverName: string;
  cutoffAt: string;
  periodStart: string | null;
  lines: Array<Omit<SettlementLineView, 'amountCollected' | 'carriedForward' | 'adjustmentsTotal'>>;
  orders: SettlementOrderView[];
}

/** One row of the admin's end-of-day worklist. */
export interface DriverOutstandingView {
  driverId: string;
  driverName: string;
  contactPhone: string;
  lines: Array<{
    currency: Currency;
    /** Commission on delivered orders not yet attached to any settlement. */
    unsettledCommission: string;
    unsettledOrderCount: number;
    /** Debt carried from a previous short payment. Signed. */
    broughtForward: string;
    totalDue: string;
  }>;
  lastSettledAt: string | null;
}

/** The driver's own answer to "how much is on me right now?". */
export interface DriverOwedView {
  lines: Array<{
    currency: Currency;
    unsettledCommission: string;
    unsettledOrderCount: number;
    broughtForward: string;
    totalDue: string;
  }>;
  /** True when every currency is square — nothing owed, nothing in credit. */
  clear: boolean;
  lastSettledAt: string | null;
}
