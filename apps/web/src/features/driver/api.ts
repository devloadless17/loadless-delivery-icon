import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { Currency, DutyStatus, OrderStatus } from '@loadless/shared';
import { api } from '@/lib/api-client';

export interface FeedOrder {
  id: string;
  orderNumber: string;
  deliveryAddressText: string;
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

async function fetchCursorPage<T>(path: string, cursor: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: '15' });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/v1${path}${path.includes('?') ? '&' : '?'}${params}`, { signal });
  if (!res.ok) throw new Error('Failed to load orders');
  return (await res.json()) as CursorPage<T>;
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
