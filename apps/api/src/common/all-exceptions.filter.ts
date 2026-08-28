import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ERROR_CODES, type ApiErrorBody, type ErrorCode } from '@loadless/shared';
import type { Request, Response } from 'express';
import { AppException } from './app.exception';

/**
 * Single place that shapes every error leaving the API:
 * { error: { code, message, details?, requestId } }
 * Internal messages and stack traces never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const requestId = request.id;

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ERROR_CODES.INTERNAL;
    let message = 'Something went wrong';
    let details: ApiErrorBody['error']['details'];

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = ERROR_CODES.RATE_LIMITED;
      message = 'Too many requests — slow down';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
      code =
        status === HttpStatus.PAYLOAD_TOO_LARGE
          ? ERROR_CODES.FILE_TOO_LARGE
          : status === HttpStatus.UNAUTHORIZED
          ? ERROR_CODES.UNAUTHENTICATED
          : status === HttpStatus.FORBIDDEN
            ? ERROR_CODES.FORBIDDEN
            : status === HttpStatus.NOT_FOUND
              ? ERROR_CODES.NOT_FOUND
              : status === HttpStatus.CONFLICT
                ? ERROR_CODES.CONFLICT
                : status >= 500
                  ? ERROR_CODES.INTERNAL
                  : ERROR_CODES.VALIDATION_FAILED;
      if (status >= 500) message = 'Something went wrong';
    } else {
      // Unknown/unexpected — log with stack, return an opaque 500.
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(`Unhandled exception on ${request.method} ${request.url}: ${err.message}`, err.stack);
    }

    const body: ApiErrorBody = { error: { code, message, details, requestId } };
    response.status(status).json(body);
  }
}
