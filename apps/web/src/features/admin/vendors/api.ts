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

async function fetchVendors(page: number, q: string) {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (q) params.set('q', q);
  const res = await fetch(`/api/v1/admin/vendors?${params}`);
  const json = (await res.json()) as { data: AdminVendor[]; meta: PageMeta };
  if (!res.ok) throw new Error('Failed to load vendors');
  return json;
}

export function useVendors(page: number, q: string) {
  return useQuery({
    queryKey: ['admin', 'vendors', page, q],
    queryFn: () => fetchVendors(page, q),
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
