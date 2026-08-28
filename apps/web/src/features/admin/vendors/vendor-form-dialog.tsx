'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createVendorSchema, updateVendorSchema } from '@loadless/shared';
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
import { ImageUpload } from '@/components/image-upload';
import { useCreateVendor, useUpdateVendor, type AdminVendor } from './api';

/** One form for create + edit; password is required on create, optional reset on edit. */
const formSchema = z.object({
  businessName: createVendorSchema.shape.businessName,
  email: z.string(),
  password: z.string(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  logoKey: z.string().nullable(),
});
type FormValues = z.infer<typeof formSchema>;

export function VendorFormDialog({
  open,
  onOpenChange,
  vendor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor: AdminVendor | null;
}) {
  const isEdit = vendor !== null;
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { businessName: '', email: '', password: '', status: 'ACTIVE', logoKey: null },
  });

  useEffect(() => {
    if (open) {
      form.reset(
        vendor
          ? {
              businessName: vendor.businessName,
              email: vendor.user.email,
              password: '',
              status: vendor.status,
              logoKey: vendor.logoKey,
            }
          : { businessName: '', email: '', password: '', status: 'ACTIVE', logoKey: null },
      );
    }
  }, [open, vendor, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (isEdit) {
        const parsed = updateVendorSchema.safeParse({
          businessName: values.businessName,
          status: values.status,
          logoKey: values.logoKey,
          ...(values.password ? { password: values.password } : {}),
        });
        if (!parsed.success) throw parsed.error;
        await updateVendor.mutateAsync({ id: vendor.id, input: parsed.data });
        toast.success('Vendor updated');
      } else {
        const parsed = createVendorSchema.safeParse(values);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            form.setError(issue.path[0] as keyof FormValues, { message: issue.message });
          }
          return;
        }
        const created = await createVendor.mutateAsync(parsed.data);
        if (values.logoKey) {
          await updateVendor.mutateAsync({ id: created.id, input: { logoKey: values.logoKey } });
        }
        toast.success('Vendor created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the vendor.');
    }
  });

  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit vendor' : 'New vendor'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the business details or suspend the account.'
              : 'The vendor signs in with this email and password.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="v-businessName">Business name</Label>
            <Input id="v-businessName" {...form.register('businessName')} aria-invalid={!!errors.businessName} />
            {errors.businessName && (
              <p className="text-sm text-destructive">{errors.businessName.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-email">Login email</Label>
            <Input
              id="v-email"
              type="email"
              placeholder="owner@business.com"
              disabled={isEdit}
              {...form.register('email')}
              aria-invalid={!!errors.email}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="v-password">{isEdit ? 'Reset password (optional)' : 'Password'}</Label>
            <Input
              id="v-password"
              type="password"
              autoComplete="new-password"
              placeholder={isEdit ? 'Leave empty to keep current password' : undefined}
              {...form.register('password')}
              aria-invalid={!!errors.password}
            />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          {isEdit && (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(v) => form.setValue('status', v as FormValues['status'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended — signs everyone out</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <ImageUpload
            purpose="VENDOR_LOGO"
            label="Logo"
            value={form.watch('logoKey')}
            onChange={(key) => form.setValue('logoKey', key)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {isEdit ? 'Save changes' : 'Create vendor'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
