import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCustomerInput, CustomerAddressInput } from '@loadless/shared';
import { api } from '@/lib/api-client';

export interface CustomerAddress {
  id: string;
  label: 'HOME' | 'WORK' | 'OTHER';
  addressText: string;
  lat: number | null;
  lng: number | null;
}

export interface Customer {
  id: string;
  normalizedPhone: string;
  name: string;
  createdByVendorId: string | null;
  createdAt: string;
  addresses: CustomerAddress[];
}

/** phone must already be a normalized +961… value (the caller normalizes as the user types). */
export function useCustomerSearch(normalizedPhone: string | null) {
  return useQuery({
    queryKey: ['customers', 'search', normalizedPhone],
    queryFn: () =>
      api.get<{ customer: Customer | null }>(
        `/customers?phone=${encodeURIComponent(normalizedPhone as string)}`,
      ),
    enabled: normalizedPhone !== null,
    staleTime: 10_000,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      api.post<{ customer: Customer; created: boolean }>('/customers', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useUpdateCustomerName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<Customer>(`/customers/${id}`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useAddAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, input }: { customerId: string; input: CustomerAddressInput }) =>
      api.post<CustomerAddress>(`/customers/${customerId}/addresses`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useArchiveAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, addressId }: { customerId: string; addressId: string }) =>
      api.post<void>(`/customers/${customerId}/addresses/${addressId}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}
