'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ERROR_CODES } from '@loadless/shared';
import { DeleteDialog } from '@/components/delete-dialog';
import { api } from '@/lib/api-client';

/**
 * A customer named on an order stays: the order is the record of a delivery
 * that happened and their phone is its identity, so the API refuses with
 * CUSTOMER_HAS_ORDERS. There is no fallback here — a customer has no account to
 * suspend — so the refusal simply explains itself and the admin edits their
 * details instead.
 */
export function CustomerDeleteDialog({
  customer,
  onOpenChange,
}: {
  customer: { id: string; name: string; normalizedPhone: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (id: string) => api.delete<{ id: string }>(`/admin/customers/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'customers'] }),
  });
  if (!customer) return null;

  return (
    <DeleteDialog
      open
      onOpenChange={onOpenChange}
      title="Delete this customer?"
      description={`${customer.name} (${customer.normalizedPhone}) will be removed for good, along with their saved addresses.`}
      confirmLabel="Delete customer"
      onConfirm={async () => {
        await del.mutateAsync(customer.id);
        toast.success(`${customer.name} deleted.`);
      }}
      blockedTitle="This customer has orders"
      blockedCode={ERROR_CODES.CUSTOMER_HAS_ORDERS}
    />
  );
}
