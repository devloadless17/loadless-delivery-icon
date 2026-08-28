import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { serializeBigInts } from './serialize';

/**
 * Wraps every successful response as { data, meta? } and stringifies BigInt.
 * Controllers return either a plain value (wrapped as data) or
 * { data, meta } (passed through) — nothing else.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((value) => {
        if (value === undefined || value === null) return { data: null };
        const isEnvelope =
          typeof value === 'object' &&
          !Array.isArray(value) &&
          'data' in (value as Record<string, unknown>);
        const envelope = isEnvelope ? (value as Record<string, unknown>) : { data: value };
        return serializeBigInts(envelope);
      }),
    );
  }
}
