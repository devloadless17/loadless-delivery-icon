/**
 * Stable machine-readable API error codes. The frontend switches on these —
 * never on HTTP status or message text.
 */
export const ERROR_CODES = {
  // generic
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',

  // auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  REFRESH_TOKEN_INVALID: 'REFRESH_TOKEN_INVALID',

  // orders
  ORDER_NO_LONGER_AVAILABLE: 'ORDER_NO_LONGER_AVAILABLE',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  DRIVER_NOT_AVAILABLE: 'DRIVER_NOT_AVAILABLE',

  // customers
  PHONE_INVALID: 'PHONE_INVALID',
  PHONE_ALREADY_EXISTS: 'PHONE_ALREADY_EXISTS',

  // deleting people and businesses that have traded
  /**
   * A vendor that has taken an order cannot be deleted: those orders carry the
   * commission snapshot and the driver earnings for deliveries that actually
   * happened. Suspend instead. The UI switches on this code to offer that.
   */
  VENDOR_HAS_ORDERS: 'VENDOR_HAS_ORDERS',
  /**
   * Same rule for a driver. orders.driver_id is ON DELETE SET NULL rather than
   * RESTRICT, so what protects a delivered order is the
   * order_status_driver_coupling CHECK, not the foreign key — and a CANCELLED
   * order is exempt from that CHECK, so a raw delete would silently detach the
   * driver there. This code turns both cases into one clear refusal that names
   * suspension as the remedy.
   */
  DRIVER_HAS_ORDERS: 'DRIVER_HAS_ORDERS',
  /**
   * A customer named on an order stays: the order history is a record of a
   * delivery that happened, and their phone is its identity. There is no
   * suspend for a customer — this one is simply a refusal.
   */
  CUSTOMER_HAS_ORDERS: 'CUSTOMER_HAS_ORDERS',

  // files
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  FILE_TYPE_NOT_ALLOWED: 'FILE_TYPE_NOT_ALLOWED',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Array<{ field: string; message: string }>;
    requestId?: string;
  };
}

export interface ApiSuccessBody<T> {
  data: T;
  meta?: Record<string, unknown>;
}
