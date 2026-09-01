import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateVendorInput, UpdateVendorInput } from '@loadless/shared';
import { api } from '@/lib/api-client';
import type { PageMeta } from '@/components/pagination';

export interface AdminVendor {
  id: string;
  businessName: string;
  logoKey: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  user: { email: string };
}

function fetchVendors(page: number, q: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (q) params.set('q', q);
  return api.page<AdminVendor[], PageMeta>(`/admin/vendors?${params}`, signal);
}

export function useVendors(page: number, q: string) {
  return useQuery({
    queryKey: ['admin', 'vendors', page, q],
    queryFn: ({ signal }) => fetchVendors(page, q, signal),
    placeholderData: (prev) => prev,
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVendorInput) => api.post<AdminVendor>('/admin/vendors', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vendors'] }),
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateVendorInput }) =>
      api.patch<AdminVendor>(`/admin/vendors/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vendors'] }),
  });
}

/**
 * Deletes a vendor who has never taken an order. One who has is refused by the
 * API with VENDOR_HAS_ORDERS — the caller shows that message and offers to
 * suspend instead, which is the operation that keeps the money record.
 */
export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/admin/vendors/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vendors'] }),
  });
}
