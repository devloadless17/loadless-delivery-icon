import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSettlementInput,
  DriverOutstandingView,
  SettlementPreviewView,
  SettlementView,
} from '@loadless/shared';
import { api } from '@/lib/api-client';
import type { PageMeta } from '@/components/pagination';

/**
 * The admin's end-of-day surface. Everything goes through `api` — a raw fetch
 * would skip the single silent 401 refresh and turn these tables permanently
 * empty once the 15-minute access token expires.
 */

export function useOutstanding(page: number, q: string) {
  return useQuery({
    queryKey: ['admin', 'settlements', 'outstanding', page, q],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (q) params.set('q', q);
      return api.page<DriverOutstandingView[], PageMeta>(
        `/admin/settlements/outstanding?${params}`,
        signal,
      );
    },
    placeholderData: (prev) => prev,
  });
}

export function useSettlements(page: number, driverId?: string) {
  return useQuery({
    queryKey: ['admin', 'settlements', 'list', page, driverId ?? ''],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (driverId) params.set('driverId', driverId);
      return api.page<SettlementView[], PageMeta>(`/admin/settlements?${params}`, signal);
    },
    placeholderData: (prev) => prev,
  });
}

export function useSettlement(id: string) {
  return useQuery({
    queryKey: ['admin', 'settlements', 'detail', id],
    queryFn: ({ signal }) => api.get<SettlementView>(`/admin/settlements/${id}`, signal),
  });
}

/**
 * What the handover would come to. Deliberately NOT cached beyond the dialog
 * being open: the admin reads these figures aloud to a driver who may be
 * finishing another delivery as they speak, and a stale total is exactly what
 * the server's drift check exists to refuse.
 */
export function useSettlementPreview(driverId: string | null) {
  return useQuery({
    queryKey: ['admin', 'settlements', 'preview', driverId ?? ''],
    queryFn: ({ signal }) =>
      api.get<SettlementPreviewView>(`/admin/drivers/${driverId}/settlements/preview`, signal),
    enabled: driverId !== null,
    gcTime: 0,
    staleTime: 0,
  });
}

export function useSettleDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ driverId, input }: { driverId: string; input: CreateSettlementInput }) =>
      api.post<SettlementView>(`/admin/drivers/${driverId}/settlements`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'settlements'] }),
  });
}

/**
 * Reverses a settlement. Nothing is deleted — the record stays in history
 * marked voided, its orders go back to unsettled and the balance is restored.
 * Only the driver's most recent settlement can be voided
 * (SETTLEMENT_NOT_LATEST), because each one's brought-forward figure is the
 * previous one's shortfall.
 */
export function useVoidSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<SettlementView>(`/admin/settlements/${id}/void`, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'settlements'] }),
  });
}
