'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createAdminSchema, updateAdminSchema } from '@loadless/shared';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateAdmin, useUpdateAdmin, type AdminAccount } from './api';

/** One form for create + edit; password is required on create, optional reset on edit. */
const formSchema = z.object({
  email: z.string(),
  password: z.string(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});
type FormValues = z.infer<typeof formSchema>;

export function AdminFormDialog({
  open,
  onOpenChange,
  admin,
  isSelf,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admin: AdminAccount | null;
  /** Editing your own row: the status control is yours to look at, not to use. */
  isSelf?: boolean;
}) {
  const isEdit = admin !== null;
  const createAdmin = useCreateAdmin();
  const updateAdmin = useUpdateAdmin();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '', status: 'ACTIVE' },
  });

  useEffect(() => {
    if (open) {
      form.reset(
        admin
          ? { email: admin.email, password: '', status: admin.isActive ? 'ACTIVE' : 'SUSPENDED' }
          : { email: '', password: '', status: 'ACTIVE' },
      );
    }
  }, [open, admin, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (isEdit) {
        const input = {
          ...(values.password ? { password: values.password } : {}),
          ...(isSelf ? {} : { status: values.status }),
        };
        const parsed = updateAdminSchema.safeParse(input);
        if (!parsed.success) throw parsed.error;
        await updateAdmin.mutateAsync({ id: admin.id, input: parsed.data });
        toast.success(
          values.password
            ? `Password reset. ${admin.email} has been signed out everywhere — give them the new one.`
            : 'Admin updated',
        );
      } else {
        const parsed = createAdminSchema.safeParse({
          email: values.email,
          password: values.password,
        });
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            form.setError(issue.path[0] as keyof FormValues, { message: issue.message });
          }
          return;
        }
        await createAdmin.mutateAsync(parsed.data);
        toast.success('Admin created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the admin.');
    }
  });

  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit admin' : 'New admin'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Reset their password or change whether they can sign in. Every admin can do this to every other one.'
              : 'A new admin can do everything you can, including managing other admins. Send them the password yourself — there is no email out of this platform.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="a-email">Login email</Label>
            <Input
              id="a-email"
              type="email"
              autoComplete="off"
              disabled={isEdit}
              aria-invalid={!!errors.email}
              {...form.register('email')}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="a-password">{isEdit ? 'Reset password (optional)' : 'Password'}</Label>
            <Input
              id="a-password"
              type="password"
              autoComplete="new-password"
              placeholder={isEdit ? 'Leave empty to keep current password' : ''}
              aria-invalid={!!errors.password}
              {...form.register('password')}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Setting a password signs them out of every device immediately.
              </p>
            )}
          </div>

          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="a-status">Status</Label>
              <Select
                value={form.watch('status')}
                disabled={isSelf}
                onValueChange={(v) => form.setValue('status', v as FormValues['status'])}
              >
                <SelectTrigger id="a-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended — signs everyone out</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {isSelf
                  ? 'You cannot suspend your own account — ask another admin.'
                  : 'Suspending is reversible; deleting is not.'}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {isEdit ? 'Save changes' : 'Create admin'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
