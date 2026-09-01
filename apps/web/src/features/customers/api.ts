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
  VendorCustomerRow,
  PlatformCustomerMatch,
} from '@loadless/shared';
import { platformLookupPrefix } from '@loadless/shared';
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

export interface OffsetPage<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/**
 * "My customers" — everyone this vendor added or has ordered for.
 *
 * This is the ONLY listing a vendor gets. Typing a phone reaches anyone on the
 * platform; browsing reaches only the people they actually deal with.
 */
function buildMyCustomersParams(params: { page: number; q: string }): URLSearchParams {
  const qs = new URLSearchParams({ page: String(params.page), limit: '10' });
  if (params.q.trim()) qs.set('q', params.q.trim());
  return qs;
}

export function useMyCustomers(params: { page: number; q: string }) {
  return useQuery({
    queryKey: ['vendor', 'customers', params.page, params.q],
    // api.page, not api.get: this endpoint answers with a { data, meta }
    // envelope, and api.get unwraps to `data` alone — which would silently
    // drop the pagination meta the table pages off.
    queryFn: ({ signal }) =>
      api.page<VendorCustomerRow[], OffsetPage<VendorCustomerRow>['meta']>(
        `/vendor/customers?${buildMyCustomersParams(params)}`,
        signal,
      ),
    placeholderData: (previous) => previous, // paging shouldn't blank the table
    staleTime: 15_000,
  });
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

/**
 * Candidates for a number still being typed — the one lookup that reaches past
 * the vendor's own customers. Enabled only once enough digits exist to make it
 * a lookup rather than a listing; letters never reach it.
 */
export function usePlatformLookup(typed: string) {
  // One shared rule decides whether a partial number is specific enough.
  const prefix = platformLookupPrefix(typed);
  const enabled = prefix !== null;
  return useQuery({
    queryKey: ['customers', 'lookup', prefix],
    queryFn: () =>
      api.get<{ matches: PlatformCustomerMatch[]; hasMore: boolean }>(
        `/customers/lookup?q=${encodeURIComponent(prefix ?? '')}`,
      ),
    enabled,
    staleTime: 30_000,
  });
}

/** Full history, seeded from the profile payload so opening the tab costs nothing. */
export function useCustomerOrders(
  customerId: string,
  seed?: { orders: CustomerOrder[]; nextCursor: string | null },
) {
  return useInfiniteQuery({
    queryKey: ['customers', 'orders', customerId],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: '10' });
      if (pageParam) params.set('cursor', pageParam);
      return api.page<CustomerOrder[], CursorPage<CustomerOrder>['meta']>(
        `/customers/${customerId}/orders?${params}`,
        signal,
      );
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
      // Adding a customer makes them mine — the list must show them at once.
      void qc.invalidateQueries({ queryKey: ['vendor', 'customers'] });
    },
  });
}

/**
 * Rewrite the name EVERY vendor sees. Allowed for admin and for the vendor who
 * added the customer; anyone else gets 403 NAME_NOT_YOURS and should use
 * `useSetDisplayName` instead.
 */
export function useUpdateCustomerName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<CustomerProfile>(`/customers/${id}`, { name }),
    onMutate: ({ id, name }) => {
      // baseName moves with it: the caller has no alias, so they follow it.
      patchCachedCustomer(qc, id, (c) => ({ ...c, name, baseName: name }));
    },
    onError: () => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
      void qc.invalidateQueries({ queryKey: ['vendor', 'customers'] });
    },
  });
}

/**
 * Set MY private name for a customer. Nothing changes for any other vendor —
 * which is the point: shared data nobody else can rewrite under you.
 */
export function useSetDisplayName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, displayName }: { id: string; displayName: string }) =>
      api.put<CustomerProfile>(`/customers/${id}/display-name`, { displayName }),
    onSuccess: (customer) => {
      patchCachedCustomer(qc, customer.id, () => customer);
      void qc.invalidateQueries({ queryKey: ['vendor', 'customers'] });
    },
  });
}

/** Drop my private name and follow the shared record again. */
export function useClearDisplayName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.delete<CustomerProfile>(`/customers/${id}/display-name`),
    onSuccess: (customer) => {
      patchCachedCustomer(qc, customer.id, () => customer);
      void qc.invalidateQueries({ queryKey: ['vendor', 'customers'] });
    },
  });
}

export function useAddAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, input }: { customerId: string; input: CustomerAddressInput }) =>
      api.post<CustomerAddress & { created: boolean }>(
        `/customers/${customerId}/addresses`,
        input,
      ),
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
