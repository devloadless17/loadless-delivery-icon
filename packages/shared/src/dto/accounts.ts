import { z } from 'zod';
import { ACCOUNT_STATUSES, DUTY_STATUSES } from '../enums';
import { MAX_COMMISSION_BPS } from '../money';
import { emailSchema, phoneSchema } from './common';

const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(200);

/** Storage key produced by the upload endpoint: "<purpose>/<cuid>.<ext>" */
export const fileKeySchema = z
  .string()
  .regex(/^[a-z_]+\/[a-z0-9]+\.(jpg|png|webp)$/, 'Invalid file reference');

// ---------- vendors (admin-managed, email login) ----------
export const createVendorSchema = z.object({
  businessName: z.string().trim().min(2).max(160),
  email: emailSchema,
  password: passwordSchema,
});
export type CreateVendorInput = z.infer<typeof createVendorSchema>;

export const updateVendorSchema = z.object({
  businessName: z.string().trim().min(2).max(160).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  password: passwordSchema.optional(),
  logoKey: fileKeySchema.nullish(),
});
export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;

// ---------- drivers (admin-managed) ----------
export const commissionBpsSchema = z
  .number()
  .int()
  .min(0)
  .max(MAX_COMMISSION_BPS);

export const createDriverSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: phoneSchema,
  /** Public contact phone shown on orders; defaults to the login phone. */
  contactPhone: phoneSchema.optional(),
  password: passwordSchema,
  commissionOverrideBps: commissionBpsSchema.nullish(),
});
export type CreateDriverInput = z.infer<typeof createDriverSchema>;

export const updateDriverSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  contactPhone: phoneSchema.optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  password: passwordSchema.optional(),
  commissionOverrideBps: commissionBpsSchema.nullish(),
  facePhotoKey: fileKeySchema.nullish(),
  bikePhotoKey: fileKeySchema.nullish(),
});

export const vendorSelfUpdateSchema = z.object({
  logoKey: fileKeySchema.nullish(),
});
export type VendorSelfUpdateInput = z.infer<typeof vendorSelfUpdateSchema>;
export type UpdateDriverInput = z.infer<typeof updateDriverSchema>;

export const dutySchema = z.object({
  dutyStatus: z.enum(DUTY_STATUSES),
});
export type DutyInput = z.infer<typeof dutySchema>;

// ---------- platform settings ----------
export const updateSettingsSchema = z.object({
  defaultCommissionBps: commissionBpsSchema,
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
