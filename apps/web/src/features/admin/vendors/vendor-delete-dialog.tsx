'use client';

import { toast } from 'sonner';
import { ERROR_CODES } from '@loadless/shared';
import { DeleteDialog } from '@/components/delete-dialog';
import { useDeleteVendor, useUpdateVendor, type AdminVendor } from './api';

/**
 * A vendor that has taken an order cannot be deleted — those orders carry the
 * commission the platform charged and the earnings a driver is owed — so the
 * API answers VENDOR_HAS_ORDERS and the dialog offers suspension instead,
 * which stops them trading with the record intact.
 */
export function VendorDeleteDialog({
  vendor,
  onOpenChange,
}: {
  vendor: AdminVendor | null;
  onOpenChange: (open: boolean) => void;
}) {
  const del = useDeleteVendor();
  const update = useUpdateVendor();
  if (!vendor) return null;

  return (
    <DeleteDialog
      open
      onOpenChange={onOpenChange}
      title="Delete this vendor?"
      description={`${vendor.businessName} and its login (${vendor.user.email}) will be removed for good. Customers and addresses they added stay on the platform.`}
      confirmLabel="Delete vendor"
      onConfirm={async () => {
        await del.mutateAsync(vendor.id);
        toast.success(`${vendor.businessName} deleted.`);
      }}
      blockedTitle="This vendor has orders"
      blockedCode={ERROR_CODES.VENDOR_HAS_ORDERS}
      fallback={{
        label: 'Suspend instead',
        run: () => update.mutateAsync({ id: vendor.id, input: { status: 'SUSPENDED' } }),
        successMessage: `${vendor.businessName} suspended — they can no longer sign in or order.`,
      }}
    />
  );
}
