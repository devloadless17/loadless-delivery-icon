import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateAdminInput, UpdateAdminInput } from '@loadless/shared';
import { api } from '@/lib/api-client';
import type { PageMeta } from '@/components/pagination';

/**
 * An admin has no profile row — an ADMIN is a `users` row and nothing else — so
 * this is the whole shape. `isActive` is what suspended means for one: login
 * and refresh both refuse on it.
 */
export interface AdminAccount {
  id: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}

function fetchAdmins(page: number, q: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (q) params.set('q', q);
  return api.page<AdminAccount[], PageMeta>(`/admin/admins?${params}`, signal);
}

export function useAdmins(page: number, q: string) {
  return useQuery({
    queryKey: ['admin', 'admins', page, q],
    queryFn: ({ signal }) => fetchAdmins(page, q, signal),
    placeholderData: (prev) => prev,
  });
}

export function useCreateAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdminInput) => api.post<AdminAccount>('/admin/admins', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'admins'] }),
  });
}

/** Resets another admin's password, or suspends/reactivates them. */
export function useUpdateAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAdminInput }) =>
      api.patch<AdminAccount>(`/admin/admins/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'admins'] }),
  });
}

/**
 * Deletes another admin. The API refuses two cases the UI also hides: your own
 * account (ADMIN_SELF_ACTION) and the last one who can still sign in
 * (LAST_ADMIN).
 */
export function useDeleteAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/admin/admins/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'admins'] }),
  });
}
