import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateDriverInput, UpdateDriverInput } from '@loadless/shared';
import { api } from '@/lib/api-client';
import type { PageMeta } from '@/components/pagination';

export interface AdminDriver {
  id: string;
  fullName: string;
  contactPhone: string;
  facePhotoKey: string | null;
  bikePhotoKey: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  dutyStatus: 'ON_DUTY' | 'OFF_DUTY';
  commissionOverrideBps: number | null;
  createdAt: string;
  user: { normalizedPhone: string };
}

async function fetchDrivers(page: number, q: string) {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (q) params.set('q', q);
  const res = await fetch(`/api/v1/admin/drivers?${params}`);
  const json = (await res.json()) as { data: AdminDriver[]; meta: PageMeta };
  if (!res.ok) throw new Error('Failed to load drivers');
  return json;
}

export function useDrivers(page: number, q: string) {
  return useQuery({
    queryKey: ['admin', 'drivers', page, q],
    queryFn: () => fetchDrivers(page, q),
    placeholderData: (prev) => prev,
  });
}

export function useCreateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDriverInput) => api.post<AdminDriver>('/admin/drivers', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'drivers'] }),
  });
}

export function useUpdateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDriverInput }) =>
      api.patch<AdminDriver>(`/admin/drivers/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'drivers'] }),
  });
}
