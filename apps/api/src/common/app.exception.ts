import { HttpException, HttpStatus } from '@nestjs/common';
import { ERROR_CODES, type ErrorCode } from '@loadless/shared';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * The only exception type services throw. Carries a stable machine code the
 * frontend switches on; the global filter renders the wire envelope.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: FieldError[],
  ) {
    super(message, status);
  }

  static validation(details: FieldError[]): AppException {
    return new AppException(
      ERROR_CODES.VALIDATION_FAILED,
      'Validation failed',
      HttpStatus.BAD_REQUEST,
      details,
    );
  }

  static notFound(message = 'Not found'): AppException {
    return new AppException(ERROR_CODES.NOT_FOUND, message, HttpStatus.NOT_FOUND);
  }

  static forbidden(message = 'Forbidden'): AppException {
    return new AppException(ERROR_CODES.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  static conflict(code: ErrorCode, message: string): AppException {
    return new AppException(code, message, HttpStatus.CONFLICT);
  }

  static unauthenticated(message = 'Authentication required'): AppException {
    return new AppException(ERROR_CODES.UNAUTHENTICATED, message, HttpStatus.UNAUTHORIZED);
  }
}
