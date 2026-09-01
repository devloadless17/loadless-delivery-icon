import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  Currency,
  DriverOwedView,
  DutyStatus,
  OrderStatus,
  SettlementView,
} from '@loadless/shared';
import { api } from '@/lib/api-client';

export interface FeedOrder {
  id: string;
  orderNumber: string;
  deliveryAddressText: string | null;
  deliveryMapsUrl: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryCharge: string;
  currency: Currency;
  deliveryInstructions: string | null;
  createdAt: string;
  vendor: { id: string; businessName: string; logoKey: string | null };
}

export interface DriverOrder extends FeedOrder {
  status: OrderStatus;
  driverEarnings: string | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failureReason: string | null;
  customer: { name: string; normalizedPhone: string };
}

interface CursorPage<T> {
  data: T[];
  meta: { nextCursor: string | null };
}

function fetchCursorPage<T>(path: string, cursor: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: '15' });
  if (cursor) params.set('cursor', cursor);
  return api.page<T[], CursorPage<T>['meta']>(
    `${path}${path.includes('?') ? '&' : '?'}${params}`,
    signal,
  );
}

export function useAvailableOrders() {
  return useInfiniteQuery({
    queryKey: ['driver', 'feed'],
    queryFn: ({ pageParam, signal }) =>
      fetchCursorPage<FeedOrder>('/driver/orders/available', pageParam, signal),
    initialPageParam: '',
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
}

export function useDriverOrders(scope: 'active' | 'history') {
  return useInfiniteQuery({
    queryKey: ['driver', 'orders', scope],
    queryFn: ({ pageParam, signal }) =>
      fetchCursorPage<DriverOrder>(`/driver/orders?scope=${scope}`, pageParam, signal),
    initialPageParam: '',
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
}

export function useDriverOrder(id: string) {
  return useQuery({
    queryKey: ['driver', 'orders', 'detail', id],
    queryFn: () => api.get<DriverOrder>(`/driver/orders/${id}`),
  });
}

function useOrderAction(action: 'accept' | 'pickup' | 'deliver') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<DriverOrder>(`/driver/orders/${id}/${action}`),
    onSettled: () => qc.invalidateQueries({ queryKey: ['driver'] }),
  });
}

export const useAcceptOrder = () => useOrderAction('accept');
export const usePickupOrder = () => useOrderAction('pickup');
export const useDeliverOrder = () => useOrderAction('deliver');

export function useReleaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<DriverOrder>(`/driver/orders/${id}/release`, { reason }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['driver'] }),
  });
}

export function useFailOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<DriverOrder>(`/driver/orders/${id}/fail`, { reason }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['driver'] }),
  });
}

export function useSetDuty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dutyStatus: DutyStatus) =>
      api.patch<{ id: string; dutyStatus: DutyStatus }>('/driver/duty', { dutyStatus }),
    // Optimistic — the one place it's allowed (idempotent, low stakes).
    onMutate: async (dutyStatus) => {
      await qc.cancelQueries({ queryKey: ['me'] });
      const previous = qc.getQueryData(['me']);
      qc.setQueryData(['me'], (old: unknown) => {
        const me = old as { user: { driver: { dutyStatus: DutyStatus } | null } } | undefined;
        if (!me?.user.driver) return old;
        return { ...me, user: { ...me.user, driver: { ...me.user.driver, dutyStatus } } };
      });
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(['me'], ctx.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['driver', 'feed'] });
    },
  });
}

// ------------------------------------------------------------- settlements

/**
 * What the driver owes the platform right now — the SAME figure the admin
 * collects against, so there is nothing to argue about at the handover.
 */
export function useMyOwed() {
  return useQuery({
    queryKey: ['driver', 'owed'],
    queryFn: ({ signal }) => api.get<DriverOwedView>('/driver/settlements/current', signal),
  });
}

/** One past handover, scoped to the signed-in driver by the API (foreign = 404). */
export function useMySettlement(id: string) {
  return useQuery({
    queryKey: ['driver', 'settlements', id],
    queryFn: ({ signal }) => api.get<SettlementView>(`/driver/settlements/${id}`, signal),
  });
}

export function useMySettlements() {
  return useQuery({
    queryKey: ['driver', 'settlements'],
    queryFn: ({ signal }) =>
      api.page<SettlementView[], { page: number; totalPages: number }>(
        '/driver/settlements?limit=10',
        signal,
      ),
  });
}
