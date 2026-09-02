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
  deliveryAddressText: string | null;
  deliveryMapsUrl: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryCharge: string;
  currency: Currency;
  deliveryInstructions: string | null;
  cancellationReason: string | null;
  createdAt: string;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  customer: { id: string; name: string; normalizedPhone: string };
  driver: {
    id: string;
    fullName: string;
    contactPhone: string;
    facePhotoKey: string | null;
  } | null;
  statusHistory?: OrderTimelineEntry[];
}

interface CursorPage<T> {
  data: T[];
  meta: { nextCursor: string | null };
}

export function useVendorOrdersList(
  status: OrderStatus | 'ALL',
  range: { from: string; to: string } = { from: '', to: '' },
) {
  return useInfiniteQuery({
    queryKey: ['vendor', 'orders', status, range.from, range.to],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '15' });
      if (status !== 'ALL') params.set('status', status);
      if (range.from) params.set('from', range.from);
      // A plain date: the API snaps both ends to the Beirut day that contains
      // them, so the range is inclusive of its end without a faked 23:59:59.
      if (range.to) params.set('to', range.to);
      if (pageParam) params.set('cursor', pageParam);
      return api.page<VendorOrder[], CursorPage<VendorOrder>['meta']>(
        `/vendor/orders?${params}`,
        signal,
      );
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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendor', 'orders'] });
      // Ordering for someone makes them one of my customers (and bumps their
      // order count), so "My customers" is stale the moment this succeeds.
      void qc.invalidateQueries({ queryKey: ['vendor', 'customers'] });
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
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
