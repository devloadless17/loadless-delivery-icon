import type { Role } from '@loadless/shared';
import { api } from './api-client';

export interface SessionUser {
  id: string;
  role: Role;
  vendorId?: string;
  driverId?: string;
}

export interface MeResponse {
  user: {
    id: string;
    normalizedPhone: string;
    role: Role;
    vendor: { id: string; businessName: string; logoKey: string | null; status: string } | null;
    driver: {
      id: string;
      fullName: string;
      contactPhone: string;
      dutyStatus: 'ON_DUTY' | 'OFF_DUTY';
      status: string;
    } | null;
  };
}

export const ROLE_HOME: Record<Role, string> = {
  ADMIN: '/admin',
  VENDOR: '/vendor',
  DRIVER: '/driver',
};

export function login(phone: string, password: string) {
  return api.post<{ user: SessionUser }>('/auth/login', { phone, password }, { skipRefresh: true });
}

export function logout() {
  return api.post<void>('/auth/logout', undefined, { skipRefresh: true });
}

export function fetchMe() {
  return api.get<MeResponse>('/auth/me');
}
