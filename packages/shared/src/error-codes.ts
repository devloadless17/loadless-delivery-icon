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
  /// Editing an address another vendor owns. 403, not 404: the row IS on the
  /// caller's screen, so "not found" would be a lie they can disprove.
  ADDRESS_NOT_YOURS: 'ADDRESS_NOT_YOURS',
  /// Rewriting the name everyone sees, when you did not add this customer.
  NAME_NOT_YOURS: 'NAME_NOT_YOURS',

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
