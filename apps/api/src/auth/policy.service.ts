import { Injectable } from '@nestjs/common';
import type { AuthUser } from './auth.types';

/**
 * Every non-trivial permission decision routes through here — the seam where
 * granular permissions (vendor staff accounts, permission tables) land later
 * without touching business services. v1 is a plain role switch.
 */
export type PolicyAction =
  | 'vendor:manage' // create/update/suspend vendors
  | 'driver:manage'
  | 'driver:set_commission'
  | 'settings:manage'
  | 'customer:read'
  | 'customer:edit'
  | 'customer:change_phone'
  | 'order:create'
  | 'order:admin_cancel'
  | 'order:reassign'
  | 'audit:read'
  | 'analytics:platform'
  | 'settlement:manage'; // collect the platform's commission from a driver

const ROLE_GRANTS: Record<PolicyAction, ReadonlyArray<AuthUser['role']>> = {
  'vendor:manage': ['ADMIN'],
  'driver:manage': ['ADMIN'],
  'driver:set_commission': ['ADMIN'],
  'settings:manage': ['ADMIN'],
  'customer:read': ['ADMIN', 'VENDOR'],
  'customer:edit': ['ADMIN', 'VENDOR'],
  'customer:change_phone': ['ADMIN'],
  'order:create': ['ADMIN', 'VENDOR'],
  'order:admin_cancel': ['ADMIN'],
  'order:reassign': ['ADMIN'],
  'audit:read': ['ADMIN'],
  'analytics:platform': ['ADMIN'],
  'settlement:manage': ['ADMIN'],
};

@Injectable()
export class PolicyService {
  can(user: AuthUser, action: PolicyAction): boolean {
    return ROLE_GRANTS[action].includes(user.role);
  }
}
