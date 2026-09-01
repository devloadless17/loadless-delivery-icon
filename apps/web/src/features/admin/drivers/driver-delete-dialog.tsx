'use client';

import { toast } from 'sonner';
import { ERROR_CODES } from '@loadless/shared';
import { DeleteDialog } from '@/components/delete-dialog';
import { useDeleteDriver, useUpdateDriver, type AdminDriver } from './api';

/**
 * A driver who has carried an order cannot be deleted: the order records what
 * they were paid, and orders.driver_id is ON DELETE SET NULL, so the database
 * would let the row go and quietly leave those earnings owed to nobody. The API
 * guard is the only thing preventing that, and here it offers suspension —
 * which ends their sessions and takes them off duty — instead.
 */
export function DriverDeleteDialog({
  driver,
  onOpenChange,
}: {
  driver: AdminDriver | null;
  onOpenChange: (open: boolean) => void;
}) {
  const del = useDeleteDriver();
  const update = useUpdateDriver();
  if (!driver) return null;

  return (
    <DeleteDialog
      open
      onOpenChange={onOpenChange}
      title="Delete this driver?"
      description={`${driver.fullName} (${driver.user.normalizedPhone}) will be removed for good, along with their login and their ID and bike photos.`}
      confirmLabel="Delete driver"
      onConfirm={async () => {
        await del.mutateAsync(driver.id);
        toast.success(`${driver.fullName} deleted.`);
      }}
      blockedTitle="This driver has deliveries"
      blockedCode={ERROR_CODES.DRIVER_HAS_ORDERS}
      fallback={{
        label: 'Suspend instead',
        run: () => update.mutateAsync({ id: driver.id, input: { status: 'SUSPENDED' } }),
        successMessage: `${driver.fullName} suspended — signed out and off duty.`,
      }}
    />
  );
}
