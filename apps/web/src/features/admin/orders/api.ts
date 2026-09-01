import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Currency, OrderStatus } from '@loadless/shared';
import { api } from '@/lib/api-client';
import { endOfDay } from '@/lib/format';
import type { OrderTimelineEntry } from '@/features/orders/api';

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  deliveryCharge: string;
  currency: Currency;
  platformCommissionAmount: string | null;
  driverEarnings: string | null;
  createdAt: string;
  vendor: { id: string; businessName: string };
  driver: { id: string; fullName: string } | null;
  customer: { name: string; normalizedPhone: string };
}

export interface AdminOrderDetail extends AdminOrderRow {
  deliveryAddressText: string | null;
  deliveryMapsUrl: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  commissionBps: number | null;
  deliveryInstructions: string | null;
  cancellationReason: string | null;
  failureReason: string | null;
  cancelledByType: string | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  customer: { id: string; name: string; normalizedPhone: string };
  driver: { id: string; fullName: string; contactPhone: string } | null;
  statusHistory: OrderTimelineEntry[];
}

export interface AdminOrderFilters {
  status?: OrderStatus;
  from?: string;
  to?: string;
  /** The platform view: whose orders, whose deliveries, which currency. */
  vendorId?: string;
  driverId?: string;
  currency?: Currency;
}

export function buildAdminOrderParams(filters: AdminOrderFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', endOfDay(filters.to));
  if (filters.vendorId) params.set('vendorId', filters.vendorId);
  if (filters.driverId) params.set('driverId', filters.driverId);
  if (filters.currency) params.set('currency', filters.currency);
  return params;
}

export function useAdminOrders(filters: AdminOrderFilters) {
  return useInfiniteQuery({
    queryKey: ['admin', 'orders', filters],
    queryFn: ({ pageParam, signal }) => {
      const params = buildAdminOrderParams(filters);
      params.set('limit', '25');
      if (pageParam) params.set('cursor', pageParam);
      return api.page<AdminOrderRow[], { nextCursor: string | null }>(
        `/admin/orders?${params}`,
        signal,
      );
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
}

export function useAdminOrder(id: string) {
  return useQuery({
    queryKey: ['admin', 'orders', 'detail', id],
    queryFn: () => api.get<AdminOrderDetail>(`/admin/orders/${id}`),
  });
}

export function useAdminCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<AdminOrderDetail>(`/admin/orders/${id}/cancel`, { reason }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] }),
  });
}

export function useAdminAssignOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, driverId }: { id: string; driverId: string }) =>
      api.post<AdminOrderDetail>(`/admin/orders/${id}/assign`, { driverId }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] }),
  });
}

export function useAdminReassignOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, driverId, reason }: { id: string; driverId: string; reason: string }) =>
      api.post<AdminOrderDetail>(`/admin/orders/${id}/reassign`, { driverId, reason }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'orders'] }),
  });
}
