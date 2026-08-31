import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  CreateCustomerInput,
  CustomerAddressInput,
  CustomerOrderView,
  CustomerProfileView,
  CustomerStatsView,
  UpdateCustomerAddressInput,
} from '@loadless/shared';
import { api } from '@/lib/api-client';

export type CustomerAddress = CustomerProfileView['addresses'][number];
export type CustomerProfile = CustomerProfileView;
export type CustomerStats = CustomerStatsView;
export type CustomerOrder = CustomerOrderView;

/** Kept for callers that only need identity (the profile is a superset). */
export type Customer = CustomerProfileView;

interface CursorPage<T> {
  data: T[];
  meta: { nextCursor: string | null };
}

/**
 * Phone lookup — the vendor's mid-call entry point. Returns the WHOLE profile
 * so the panel paints from one request.
 *
 * Deliberately NO placeholderData/keepPreviousData: showing the previous
 * customer's details under a newly typed number would be a wrong-person error
 * on a live call. A skeleton is always the safer answer than stale identity.
 */
export function useCustomerSearch(normalizedPhone: string | null) {
  return useQuery({
    queryKey: ['customers', 'search', normalizedPhone],
    queryFn: () =>
      api.get<{ customer: CustomerProfile | null }>(
        `/customers?phone=${encodeURIComponent(normalizedPhone as string)}`,
      ),
    enabled: normalizedPhone !== null,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
  });
}

/** Full history, seeded from the profile payload so opening the tab costs nothing. */
export function useCustomerOrders(
  customerId: string,
  seed?: { orders: CustomerOrder[]; nextCursor: string | null },
) {
  return useInfiniteQuery({
    queryKey: ['customers', 'orders', customerId],
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '10' });
      if (pageParam) params.set('cursor', pageParam);
      const res = await fetch(`/api/v1/customers/${customerId}/orders?${params}`, { signal });
      if (!res.ok) throw new Error('Failed to load orders');
      return (await res.json()) as CursorPage<CustomerOrder>;
    },
    initialPageParam: '',
    getNextPageParam: (last) => last.meta.nextCursor ?? undefined,
    ...(seed
      ? {
          initialData: {
            pages: [{ data: seed.orders, meta: { nextCursor: seed.nextCursor } }],
            pageParams: [''],
          },
        }
      : {}),
    staleTime: 15_000,
  });
}

/**
 * Patch a customer wherever it sits in the cache (search results are keyed by
 * phone, so we can't address them by id). Reconciling beats invalidating: an
 * inline rename shouldn't refetch the whole profile mid-call.
 */
function patchCachedCustomer(
  qc: QueryClient,
  customerId: string,
  patch: (c: CustomerProfile) => CustomerProfile,
) {
  qc.setQueriesData<{ customer: CustomerProfile | null }>(
    { queryKey: ['customers', 'search'] },
    (old) =>
      old?.customer && old.customer.id === customerId
        ? { ...old, customer: patch(old.customer) }
        : old,
  );
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      api.post<{ customer: CustomerProfile; created: boolean }>('/customers', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
    },
  });
}

export function useUpdateCustomerName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<CustomerProfile>(`/customers/${id}`, { name }),
    onMutate: ({ id, name }) => {
      patchCachedCustomer(qc, id, (c) => ({ ...c, name }));
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
    },
  });
}

export function useAddAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, input }: { customerId: string; input: CustomerAddressInput }) =>
      api.post<CustomerAddress>(`/customers/${customerId}/addresses`, input),
    onSuccess: (address, { customerId }) => {
      patchCachedCustomer(qc, customerId, (c) => ({
        ...c,
        addresses: c.addresses.some((a) => a.id === address.id)
          ? c.addresses.map((a) => (a.id === address.id ? address : a))
          : [...c.addresses, address],
      }));
      void qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
    },
  });
}

export function useUpdateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      customerId,
      addressId,
      input,
    }: {
      customerId: string;
      addressId: string;
      input: UpdateCustomerAddressInput;
    }) => api.patch<CustomerAddress>(`/customers/${customerId}/addresses/${addressId}`, input),
    onSuccess: (address, { customerId }) => {
      patchCachedCustomer(qc, customerId, (c) => ({
        ...c,
        addresses: c.addresses.map((a) => (a.id === address.id ? address : a)),
      }));
      void qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
    },
  });
}

export function useArchiveAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, addressId }: { customerId: string; addressId: string }) =>
      api.post<void>(`/customers/${customerId}/addresses/${addressId}/archive`),
    onSuccess: (_void, { customerId, addressId }) => {
      patchCachedCustomer(qc, customerId, (c) => ({
        ...c,
        addresses: c.addresses.filter((a) => a.id !== addressId),
      }));
      void qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
    },
  });
}
