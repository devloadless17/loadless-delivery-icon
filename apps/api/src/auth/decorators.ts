import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@loadless/shared';
import type { Request } from 'express';
import type { AuthUser } from './auth.types';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
  return request.user;
});
