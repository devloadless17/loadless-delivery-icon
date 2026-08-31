import { z } from 'zod';
import { ADDRESS_LABELS, ORDER_STATUSES, type AddressLabel, type OrderStatus } from '../enums';
import type { Currency } from '../money';
import { cuidSchema, cursorPaginationSchema, phoneSchema } from './common';

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

/** Correct a saved address in place. mapsUrl is nullable so a stale link can be cleared. */
export const updateCustomerAddressSchema = z
  .object({
    label: z.enum(ADDRESS_LABELS).optional(),
    addressText: z.string().trim().min(3).max(500).optional(),
    mapsUrl: mapsUrlSchema.nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Nothing to update',
  });
export type UpdateCustomerAddressInput = z.infer<typeof updateCustomerAddressSchema>;

/**
 * Customer order history. Deliberately has NO vendorId field: a vendor's slice
 * comes from their JWT and can never be widened by a query parameter.
 */
export const customerOrderHistoryFilterSchema = cursorPaginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
});
export type CustomerOrderHistoryFilter = z.infer<typeof customerOrderHistoryFilterSchema>;
export const archiveCustomerAddressSchema = z.object({ addressId: cuidSchema });

// ---------------------------------------------------------------------------
// Wire shapes — what the customer-profile endpoints return.
// (Dates are ISO strings post-JSON; BigInt money arrives as strings.)
// ---------------------------------------------------------------------------

/** Which slice of order data the stats describe. Vendors NEVER get PLATFORM. */
export type CustomerProfileScope = 'VENDOR' | 'PLATFORM';

export interface CustomerAddressView {
  id: string;
  label: AddressLabel;
  addressText: string;
  mapsUrl: string | null;
  lat: number | null;
  lng: number | null;
}

/** Money never merges across currencies — one entry per currency. */
export interface MoneyByCurrencyView {
  currency: Currency;
  amount: string;
  orders: number;
}

/** Derived from order snapshots, not the address book (saved rows can duplicate). */
export interface CustomerTopAddressView {
  addressText: string;
  mapsUrl: string | null;
  orderCount: number;
  lastUsedAt: string;
}

export interface CustomerStatsView {
  scope: CustomerProfileScope;
  /** Platform-wide count — the ONLY cross-vendor value. A bare integer. */
  totalOrdersPlatform: number;
  /** Orders with the CALLING vendor (equals totalOrdersPlatform for ADMIN). */
  ordersInScope: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  delivered: number;
  cancelled: number;
  failed: number;
  /** PENDING + DRIVER_ASSIGNED + PICKED_UP — "one is out for them right now". */
  inProgress: number;
  deliveredSpend: MoneyByCurrencyView[];
  topAddress: CustomerTopAddressView | null;
}

export interface CustomerOrderView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  deliveryAddressText: string;
  deliveryMapsUrl: string | null;
  deliveryInstructions: string | null;
  deliveryCharge: string;
  currency: Currency;
  createdAt: string;
  deliveredAt: string | null;
  /** ADMIN scope only — vendors never learn who else delivers to this customer. */
  vendorName?: string;
}

export interface CustomerProfileView {
  id: string;
  normalizedPhone: string;
  name: string;
  createdByVendorId: string | null;
  createdAt: string;
  addresses: CustomerAddressView[];
  stats: CustomerStatsView;
  recentOrders: CustomerOrderView[];
  recentOrdersNextCursor: string | null;
}
