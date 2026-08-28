import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@loadless/shared';
import type { Request } from 'express';
import { AppException } from '../common/app.exception';
import type { AuthUser } from './auth.types';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';

/** Coarse role gating declared on every controller; ownership scoping happens in services. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!user) throw AppException.unauthenticated();
    if (!required.includes(user.role)) throw AppException.forbidden();
    return true;
  }
}
