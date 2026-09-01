export const ROLES = ['ADMIN', 'VENDOR', 'DRIVER'] as const;
export type Role = (typeof ROLES)[number];

export const ORDER_STATUSES = [
  'PENDING',
  'DRIVER_ASSIGNED',
  'PICKED_UP',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['DELIVERED', 'CANCELLED', 'FAILED'];

export const DUTY_STATUSES = ['ON_DUTY', 'OFF_DUTY'] as const;
export type DutyStatus = (typeof DUTY_STATUSES)[number];

export const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const ADDRESS_LABELS = ['HOME', 'WORK', 'OTHER'] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

export const ACTOR_TYPES = ['ADMIN', 'VENDOR', 'DRIVER', 'SYSTEM'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const FILE_PURPOSES = ['VENDOR_LOGO', 'DRIVER_FACE', 'DRIVER_BIKE'] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

export const SETTLEMENT_STATUSES = ['SETTLED', 'VOIDED'] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

/**
 * Non-order money on a settlement. The TYPE carries the meaning; the DIRECTION
 * carries the sign, so no amount is ever entered as a negative number.
 */
export const ADJUSTMENT_TYPES = ['FINE', 'BONUS', 'ADVANCE', 'CORRECTION'] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

/** DEBIT: the driver owes more. CREDIT: the driver owes less. */
export const ADJUSTMENT_DIRECTIONS = ['DEBIT', 'CREDIT'] as const;
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number];

/**
 * Which way each adjustment type may point. A fine can only ever increase what
 * a driver owes and a bonus can only ever reduce it; only a correction is free
 * to go either way. Mirrored by the adjustment_sign_by_type DB CHECK.
 */
export const ADJUSTMENT_DIRECTION_BY_TYPE: Record<
  AdjustmentType,
  ReadonlyArray<AdjustmentDirection>
> = {
  FINE: ['DEBIT'],
  ADVANCE: ['DEBIT'],
  BONUS: ['CREDIT'],
  CORRECTION: ['DEBIT', 'CREDIT'],
};
