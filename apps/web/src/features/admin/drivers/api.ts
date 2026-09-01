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

function fetchDrivers(page: number, q: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (q) params.set('q', q);
  return api.page<AdminDriver[], PageMeta>(`/admin/drivers?${params}`, signal);
}

export function useDrivers(page: number, q: string) {
  return useQuery({
    queryKey: ['admin', 'drivers', page, q],
    queryFn: ({ signal }) => fetchDrivers(page, q, signal),
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

/**
 * Deletes a driver who has never carried an order. One who has is refused with
 * DRIVER_HAS_ORDERS: orders.driver_id is ON DELETE SET NULL, so removing them
 * would silently detach their earnings from the deliveries they were paid for.
 */
export function useDeleteDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/admin/drivers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'drivers'] }),
  });
}
