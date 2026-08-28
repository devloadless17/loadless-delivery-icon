'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createDriverSchema, updateDriverSchema, formatBps } from '@loadless/shared';
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
import { useSettings } from '@/features/admin/settings/api';
import { useCreateDriver, useUpdateDriver, type AdminDriver } from './api';

const formSchema = z.object({
  fullName: z.string(),
  phone: z.string(),
  contactPhone: z.string(),
  password: z.string(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  /** Empty string = platform default commission. Whole percent input. */
  commissionPercent: z.string(),
  facePhotoKey: z.string().nullable(),
  bikePhotoKey: z.string().nullable(),
});
type FormValues = z.infer<typeof formSchema>;

function percentToBps(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null; // clear override → platform default
  const pct = Number(trimmed);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return undefined; // invalid
  return Math.round(pct * 100);
}

export function DriverFormDialog({
  open,
  onOpenChange,
  driver,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: AdminDriver | null;
}) {
  const isEdit = driver !== null;
  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const { data: settings } = useSettings();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      contactPhone: '',
      password: '',
      status: 'ACTIVE',
      commissionPercent: '',
      facePhotoKey: null,
      bikePhotoKey: null,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset(
        driver
          ? {
              fullName: driver.fullName,
              phone: driver.user.normalizedPhone,
              contactPhone: driver.contactPhone,
              password: '',
              status: driver.status,
              commissionPercent:
                driver.commissionOverrideBps === null
                  ? ''
                  : String(driver.commissionOverrideBps / 100),
              facePhotoKey: driver.facePhotoKey,
              bikePhotoKey: driver.bikePhotoKey,
            }
          : {
              fullName: '',
              phone: '',
              contactPhone: '',
              password: '',
              status: 'ACTIVE',
              commissionPercent: '',
              facePhotoKey: null,
              bikePhotoKey: null,
            },
      );
    }
  }, [open, driver, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    const bps = percentToBps(values.commissionPercent);
    if (bps === undefined) {
      form.setError('commissionPercent', { message: 'Enter a percentage between 0 and 100' });
      return;
    }
    try {
      if (isEdit) {
        const parsed = updateDriverSchema.safeParse({
          fullName: values.fullName,
          contactPhone: values.contactPhone || undefined,
          status: values.status,
          commissionOverrideBps: bps,
          facePhotoKey: values.facePhotoKey,
          bikePhotoKey: values.bikePhotoKey,
          ...(values.password ? { password: values.password } : {}),
        });
        if (!parsed.success) throw parsed.error;
        await updateDriver.mutateAsync({ id: driver.id, input: parsed.data });
        toast.success('Driver updated');
      } else {
        const parsed = createDriverSchema.safeParse({
          fullName: values.fullName,
          phone: values.phone,
          contactPhone: values.contactPhone || undefined,
          password: values.password,
          commissionOverrideBps: bps,
        });
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            form.setError(issue.path[0] as keyof FormValues, { message: issue.message });
          }
          return;
        }
        const created = await createDriver.mutateAsync(parsed.data);
        if (values.facePhotoKey || values.bikePhotoKey) {
          await updateDriver.mutateAsync({
            id: created.id,
            input: { facePhotoKey: values.facePhotoKey, bikePhotoKey: values.bikePhotoKey },
          });
        }
        toast.success('Driver created');
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the driver.');
    }
  });

  const { errors, isSubmitting } = form.formState;
  const defaultCommission = settings ? formatBps(settings.defaultCommissionBps) : '…';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit driver' : 'New driver'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update details, commission, photos, or suspend the account.'
              : 'The driver signs in with this phone number and password.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="d-fullName">Full name</Label>
            <Input id="d-fullName" {...form.register('fullName')} aria-invalid={!!errors.fullName} />
            {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="d-phone">Login phone</Label>
              <Input
                id="d-phone"
                type="tel"
                className="data-mono"
                placeholder="71 123 456"
                disabled={isEdit}
                {...form.register('phone')}
                aria-invalid={!!errors.phone}
              />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="d-contactPhone">Contact phone</Label>
              <Input
                id="d-contactPhone"
                type="tel"
                className="data-mono"
                placeholder="Same as login"
                {...form.register('contactPhone')}
                aria-invalid={!!errors.contactPhone}
              />
              {errors.contactPhone && (
                <p className="text-sm text-destructive">{errors.contactPhone.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="d-password">{isEdit ? 'Reset password (optional)' : 'Password'}</Label>
            <Input
              id="d-password"
              type="password"
              autoComplete="new-password"
              placeholder={isEdit ? 'Leave empty to keep current password' : undefined}
              {...form.register('password')}
              aria-invalid={!!errors.password}
            />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="d-commission">Commission override (%)</Label>
            <Input
              id="d-commission"
              inputMode="decimal"
              className="data-mono"
              placeholder={`Platform default: ${defaultCommission}`}
              {...form.register('commissionPercent')}
              aria-invalid={!!errors.commissionPercent}
            />
            {errors.commissionPercent && (
              <p className="text-sm text-destructive">{errors.commissionPercent.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Leave empty to use the platform default. Applies to orders this driver accepts from now
              on — past orders keep their original split.
            </p>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <ImageUpload
              purpose="DRIVER_FACE"
              label="Face photo"
              value={form.watch('facePhotoKey')}
              onChange={(key) => form.setValue('facePhotoKey', key)}
            />
            <ImageUpload
              purpose="DRIVER_BIKE"
              label="Bike photo"
              value={form.watch('bikePhotoKey')}
              onChange={(key) => form.setValue('bikePhotoKey', key)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {isEdit ? 'Save changes' : 'Create driver'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
