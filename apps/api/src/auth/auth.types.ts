import type { Role } from '@loadless/shared';

/** JWT claims. Profile ids ride along so request handling needs no DB hit. */
export interface AccessTokenClaims {
  sub: string; // userId
  role: Role;
  tv: number; // tokenVersion at issue time
  vid?: string; // vendorId when role === VENDOR
  did?: string; // driverId when role === DRIVER
}

/** Attached to request.user by JwtAuthGuard. */
export interface AuthUser {
  userId: string;
  role: Role;
  tokenVersion: number;
  vendorId?: string;
  driverId?: string;
}
