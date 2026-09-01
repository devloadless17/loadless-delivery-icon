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
 * Non-order money on a settlement: a fine, a bonus, fuel money, a correction.
 *
 * There is deliberately no category list. Every such line is only ever one of
 * two things — it either adds to what the driver owes or takes away from it —
 * and WHY is a sentence, not a dropdown. Making someone pick "Fine" vs
 * "Correction" before they can write "lost the thermal bag" adds a decision,
 * adds a wrong answer, and tells the driver less than the sentence does.
 */
export const ADJUSTMENT_DIRECTIONS = ['DEBIT', 'CREDIT'] as const;
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number];
