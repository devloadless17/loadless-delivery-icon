import { z } from 'zod';
import { ADDRESS_LABELS } from '../enums';
import { cuidSchema, phoneSchema } from './common';

export const latitudeSchema = z.coerce.number().min(-90).max(90);
export const longitudeSchema = z.coerce.number().min(-180).max(180);

/**
 * Locations travel as links here: the customer shares a Google Maps link on
 * WhatsApp, the vendor pastes it, the driver taps it. Any https link is
 * accepted (goo.gl short links, maps.app.goo.gl, full google.com/maps URLs).
 */
export const mapsUrlSchema = z
  .string()
  .trim()
  .max(600, 'Link is too long')
  .refine((v) => /^https?:\/\/\S+$/.test(v), 'Paste a valid link (https://…)');

export const customerSearchSchema = z.object({
  phone: phoneSchema,
});
export type CustomerSearchInput = z.infer<typeof customerSearchSchema>;

export const customerAddressInputSchema = z.object({
  label: z.enum(ADDRESS_LABELS).default('OTHER'),
  addressText: z.string().trim().min(3).max(500),
  mapsUrl: mapsUrlSchema.optional(),
  lat: latitudeSchema.optional(),
  lng: longitudeSchema.optional(),
});
export type CustomerAddressInput = z.infer<typeof customerAddressInputSchema>;

export const createCustomerSchema = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(2).max(120),
  address: customerAddressInputSchema.optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

/** Admin may also correct the identity phone (vendors never can). */
export const adminUpdateCustomerSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional(),
});
export type AdminUpdateCustomerInput = z.infer<typeof adminUpdateCustomerSchema>;

export const addCustomerAddressSchema = customerAddressInputSchema;
export const archiveCustomerAddressSchema = z.object({ addressId: cuidSchema });
