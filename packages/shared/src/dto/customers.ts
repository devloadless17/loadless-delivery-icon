import { z } from 'zod';
import { ADDRESS_LABELS, ORDER_STATUSES, type AddressLabel, type OrderStatus } from '../enums';
import type { Currency } from '../money';
import { LEBANON_CC, phoneSearchPrefix } from '../phone';
import { cuidSchema, cursorPaginationSchema, offsetPaginationSchema, phoneSchema } from './common';

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

/**
 * A location needs EITHER typed text or a Google Maps link — customers here
 * usually just share a pin, and the driver navigates by the link regardless.
 */
export const customerAddressInputSchema = z
  .object({
    label: z.enum(ADDRESS_LABELS).default('OTHER'),
    addressText: z.string().trim().min(3).max(500).optional(),
    mapsUrl: mapsUrlSchema.optional(),
    lat: latitudeSchema.optional(),
    lng: longitudeSchema.optional(),
  })
  .refine((a) => !!a.addressText || !!a.mapsUrl, {
    path: ['addressText'],
    message: 'Add an address or paste a Google Maps link',
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
    addressText: z.string().trim().min(3).max(500).nullable().optional(),
    mapsUrl: mapsUrlSchema.nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Nothing to update',
  });
export type UpdateCustomerAddressInput = z.infer<typeof updateCustomerAddressSchema>;

/**
 * Platform phone lookup while a number is still being typed.
 *
 * The ONE way a vendor reaches someone they have never served without knowing
 * the whole number. Deliberately narrow:
 *   - phone digits only — a name never searches beyond your own customers,
 *     because a name-searchable directory IS a competitor's client list;
 *   - at least PLATFORM_LOOKUP_MIN_DIGITS of them, so a bucket stays tiny and
 *     sweeping the number space stays infeasible under the route's throttle;
 *   - identity only in the response (name + phone) — never an address, an
 *     order, or a stat. Exactly what typing the full number already gives.
 */
export const PLATFORM_LOOKUP_MIN_DIGITS = 6;
/** Never widen without re-reading the enumeration note above. */
export const PLATFORM_LOOKUP_LIMIT = 10;

/**
 * Is this partial number specific enough to ask the platform about?
 *
 * Counted on the STORED prefix, country code included, so the bar is the same
 * whoever the customer is: Lebanon's `+961` plus six national digits. A
 * country with a shorter code simply has to be more specific, which errs the
 * safe way — the threshold exists to keep the number space unwalkable.
 */
export function platformLookupPrefix(input: string): string | null {
  const prefix = phoneSearchPrefix(input);
  const digits = prefix.replace(/\D/g, '').length;
  return digits >= LEBANON_CC.length + PLATFORM_LOOKUP_MIN_DIGITS ? prefix : null;
}

export const platformLookupSchema = z.object({
  q: z.string().trim().min(1).max(40),
});
export type PlatformLookupInput = z.infer<typeof platformLookupSchema>;

/** Identity and nothing else — plus whether they are already yours. */
export interface PlatformCustomerMatch {
  id: string;
  name: string;
  normalizedPhone: string;
  /**
   * Is this already one of MY customers? A fact about the caller's own
   * relationship, never about anyone else's — a screen that already lists the
   * caller's customers can drop these, and one that doesn't can label them.
   */
  isYours: boolean;
}

/**
 * A vendor's PRIVATE name for a customer. Setting it changes nothing for any
 * other vendor; clearing it (DELETE) returns to following the global name.
 */
export const setCustomerDisplayNameSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
});
export type SetCustomerDisplayNameInput = z.infer<typeof setCustomerDisplayNameSchema>;

/**
 * "My customers" — the vendor's own list. Like the history filter, it has NO
 * vendorId field: the boundary is the JWT, and an injected ?vendorId is
 * dropped by zod before it can reach a query.
 */
export const myCustomersFilterSchema = offsetPaginationSchema.extend({
  q: z.string().trim().max(120).optional(),
});
export type MyCustomersFilter = z.infer<typeof myCustomersFilterSchema>;

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

/**
 * Who may edit an address, from the CALLER's point of view.
 *   MINE     — you added it: edit and archive freely.
 *   OTHER    — another vendor added it and relies on it: read-only for you.
 *   PLATFORM — nobody owns it (admin-only).
 * A computed enum, never the owning vendor's id: vendors must not be able to
 * correlate a customer's addresses with a competitor.
 */
export type AddressOwnership = 'MINE' | 'OTHER' | 'PLATFORM';

export interface CustomerAddressView {
  id: string;
  label: AddressLabel;
  addressText: string | null;
  mapsUrl: string | null;
  lat: number | null;
  lng: number | null;
  ownership: AddressOwnership;
  /** ADMIN scope only — which vendor owns the row. */
  ownerVendorName?: string | null;
  /**
   * Add responses only: did this write actually create a row? The address book
   * holds one row per place, so saving an identical copy of an existing
   * address is a no-op that returns that row — and the UI must not call that
   * "saved".
   */
  created?: boolean;
  /**
   * Add responses only, and only when `created` is false: WHICH rule matched.
   * 'link' means the Google Maps pin collided — the address text may be
   * completely different, so a message about the address would send the vendor
   * to edit the wrong field.
   */
  matchedOn?: 'link' | 'text';
}

/** Money never merges across currencies — one entry per currency. */
export interface MoneyByCurrencyView {
  currency: Currency;
  amount: string;
  orders: number;
}

/** Derived from order snapshots, not the address book (saved rows can duplicate). */
export interface CustomerTopAddressView {
  addressText: string | null;
  mapsUrl: string | null;
  orderCount: number;
  lastUsedAt: string;
}

export interface CustomerStatsView {
  scope: CustomerProfileScope;
  /**
   * Orders within the CALLER's scope — their own trade for a vendor, the whole
   * platform for an admin.
   *
   * There is deliberately no cross-vendor number beside it. A "3 on platform"
   * caption told a vendor that two other shops serve this customer, which is
   * the competitor's business, not theirs. A vendor sees their own trade and
   * nothing else.
   */
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
  deliveryAddressText: string | null;
  deliveryMapsUrl: string | null;
  deliveryInstructions: string | null;
  deliveryCharge: string;
  currency: Currency;
  createdAt: string;
  deliveredAt: string | null;
  /** ADMIN scope only — vendors never learn who else delivers to this customer. */
  vendorName?: string;
}

/**
 * Whose name you are editing.
 *   GLOBAL — the name every vendor sees (you added this customer, or you're admin).
 *   MINE   — your private label; everyone else keeps the base name.
 * The UI states the consequence BEFORE the keystroke, which is the whole
 * answer to "another vendor changed my customer's name and I got confused".
 */
export type CustomerNameScope = 'GLOBAL' | 'MINE';

export interface CustomerProfileView {
  id: string;
  normalizedPhone: string;
  /** The name to display: your alias if you set one, else the global name. */
  name: string;
  /** The global name — what a vendor without an alias sees. */
  baseName: string;
  /** Your private alias, or null when you follow the global name. */
  displayName: string | null;
  /** Which name a save would rewrite. */
  nameScope: CustomerNameScope;
  /** VENDOR scope: did YOU add them. (No competitor id ever ships.) */
  addedByYou: boolean;
  /** ADMIN scope only. */
  createdByVendorId?: string | null;
  createdAt: string;
  addresses: CustomerAddressView[];
  stats: CustomerStatsView;
  recentOrders: CustomerOrderView[];
  recentOrdersNextCursor: string | null;
  /** ADMIN scope only — every vendor who deals with this customer. */
  vendorLinks?: CustomerVendorLinkView[];
}

/** One vendor's relationship with a customer, as the admin sees it. */
export interface CustomerVendorLinkView {
  vendorId: string;
  businessName: string;
  /** That vendor's private name for this customer, if they set one. */
  displayName: string | null;
  ordersCount: number;
  lastOrderAt: string | null;
  isCreator: boolean;
}

/** One row of a vendor's "my customers" list. */
export interface VendorCustomerRow {
  id: string;
  name: string;
  baseName: string;
  displayName: string | null;
  normalizedPhone: string;
  /** Orders with YOU, not platform-wide. */
  ordersCount: number;
  lastOrderAt: string | null;
  addressCount: number;
  addedByYou: boolean;
}
