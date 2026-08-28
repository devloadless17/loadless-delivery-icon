import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface PlatformSettings {
  defaultCommissionBps: number;
}

export function useSettings() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<PlatformSettings>('/admin/settings'),
    staleTime: 60_000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlatformSettings) => api.patch<PlatformSettings>('/admin/settings', input),
    onSuccess: (data) => qc.setQueryData(['admin', 'settings'], data),
  });
}
