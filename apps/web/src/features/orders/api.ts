import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { CreateOrderInput, Currency, OrderStatus } from '@loadless/shared';
import { api } from '@/lib/api-client';

export interface OrderTimelineEntry {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorType: 'ADMIN' | 'VENDOR' | 'DRIVER' | 'SYSTEM';
  reason: string | null;
  createdAt: string;
}

export interface VendorOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  deliveryAddressText: string;
  deliveryMapsUrl: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryCharge: string;
  currency: Currency;
  notes: string | null;
  deliveryInstructions: string | null;
  cancellationReason: string | null;
  createdAt: string;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  customer: { id: string; name: string; normalizedPhone: string };
  driver: { id: string; fullName: string; contactPhone: string } | null;
  statusHistory?: OrderTimelineEntry[];
}

interface CursorPage<T> {
  data: T[];
  meta: { nextCursor: string | null };
}

export function useVendorOrdersList(status: OrderStatus | 'ALL') {
  return useInfiniteQuery({
    queryKey: ['vendor', 'orders', status],
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '15' });
      if (status !== 'ALL') params.set('status', status);
      if (pageParam) params.set('cursor', pageParam);
      const res = await fetch(`/api/v1/vendor/orders?${params}`, { signal });
      if (!res.ok) throw new Error('Failed to load orders');
      return (await res.json()) as CursorPage<VendorOrder>;
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
  });
}

export function useVendorOrder(id: string) {
  return useQuery({
    queryKey: ['vendor', 'orders', 'detail', id],
    queryFn: () => api.get<VendorOrder>(`/vendor/orders/${id}`),
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput) => api.post<VendorOrder>('/vendor/orders', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendor', 'orders'] }),
  });
}

export function useCancelOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<VendorOrder>(`/vendor/orders/${id}/cancel`, { reason }),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: ['vendor', 'orders'] });
      void qc.invalidateQueries({ queryKey: ['vendor', 'orders', 'detail', id] });
    },
  });
}
