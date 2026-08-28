import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfigService } from '../config/config.service';
import { AppException } from '../common/app.exception';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF backstop for cookie auth (on top of SameSite=Lax): state-changing
 * requests carrying a browser Origin must match APP_ORIGIN exactly.
 * Requests without Origin/Referer (curl, server-to-server, tests) pass —
 * they are not CSRF vectors.
 */
@Injectable()
export class OriginCheckGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const allowed = this.config.env.APP_ORIGIN;
    const origin = request.headers.origin;
    if (origin && origin !== allowed) {
      throw AppException.forbidden('Cross-origin request rejected');
    }
    if (!origin) {
      const referer = request.headers.referer;
      if (referer && !referer.startsWith(`${allowed}/`) && referer !== allowed) {
        throw AppException.forbidden('Cross-origin request rejected');
      }
    }
    return true;
  }
}
