import { useQuery } from '@tanstack/react-query';
import type { Currency, OrderStatus } from '@loadless/shared';
import { api } from '@/lib/api-client';

export interface DeliveredSums {
  currency: Currency;
  deliveredCount: number;
  deliveryVolume: string;
  platformCommission: string;
  driverEarnings: string;
}

export interface AdminDashboard {
  open: Partial<Record<OrderStatus, number>>;
  today: Partial<Record<OrderStatus, number>>;
  week: Partial<Record<OrderStatus, number>>;
  deliveredToday: DeliveredSums[];
  deliveredWeek: DeliveredSums[];
  onDutyDrivers: number;
  activeVendors: number;
  avgAssignSeconds: number | null;
  avgDeliverSeconds: number | null;
  dailySeries: Array<{
    day: string;
    created: number;
    delivered: number;
    failedOrCancelled: number;
  }>;
  generatedAt: string;
}

export function useAdminDashboard() {
  return useQuery({
    queryKey: ['admin', 'analytics', 'dashboard'],
    queryFn: () => api.get<AdminDashboard>('/admin/analytics/dashboard'),
    refetchInterval: 60_000, // sockets nudge it too; this is the safety net
  });
}
