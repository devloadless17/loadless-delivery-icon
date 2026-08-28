import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppException } from '../common/app.exception';
import { ACCESS_COOKIE } from './auth.constants';
import type { AuthUser } from './auth.types';
import { IS_PUBLIC_KEY } from './decorators';
import { RevocationService } from './revocation.service';
import { TokenService } from './token.service';

/**
 * Global authentication guard. Reads the access JWT from the httpOnly cookie
 * (Authorization: Bearer fallback for tooling), verifies it statelessly, and
 * rejects revoked token versions (deactivation bites within the access window).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly revocation: RevocationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const cookieToken = (request.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    const bearer = request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice(7)
      : undefined;
    const token = cookieToken ?? bearer;
    if (!token) throw AppException.unauthenticated();

    const claims = this.tokens.verifyAccessToken(token);
    if (!claims) throw AppException.unauthenticated('Session expired');

    if (await this.revocation.isRevoked(claims.sub, claims.tv)) {
      throw AppException.unauthenticated('Session revoked');
    }

    request.user = {
      userId: claims.sub,
      role: claims.role,
      tokenVersion: claims.tv,
      vendorId: claims.vid,
      driverId: claims.did,
    };
    return true;
  }
}
