'use client';

import { toast } from 'sonner';
import { ERROR_CODES } from '@loadless/shared';
import { DeleteDialog } from '@/components/delete-dialog';
import { useDeleteAdmin, type AdminAccount } from './api';

/**
 * No "suspend instead" fallback here, unlike vendors and drivers.
 *
 * The only thing that blocks deleting an admin is being the last one who can
 * sign in — and suspending that same account is refused for exactly the same
 * reason, so offering it would be offering a button that cannot work. The
 * refusal simply stands, with the API's sentence explaining it.
 */
export function AdminDeleteDialog({
  admin,
  onOpenChange,
}: {
  admin: AdminAccount | null;
  onOpenChange: (open: boolean) => void;
}) {
  const del = useDeleteAdmin();
  if (!admin) return null;

  return (
    <DeleteDialog
      open
      onOpenChange={onOpenChange}
      title="Delete this admin?"
      description={`${admin.email} will lose access immediately and permanently. What they did stays in the audit log. If you only want to stop them signing in for now, suspend them instead — that is reversible.`}
      confirmLabel="Delete admin"
      onConfirm={async () => {
        await del.mutateAsync(admin.id);
        toast.success(`${admin.email} deleted.`);
      }}
      blockedTitle="This is the last admin"
      blockedCode={ERROR_CODES.LAST_ADMIN}
    />
  );
}
