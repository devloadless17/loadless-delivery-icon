import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppException } from './app.exception';

/**
 * Validates and transforms request input against a shared zod schema.
 * Usage: @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw AppException.validation(
        result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
