import type { Prisma } from '@prisma/client';
import { AppException } from '../common/app.exception';
import type { AuthUser } from '../auth/auth.types';

/**
 * THE single place an order `where` is built for customer-facing routes.
 *
 * Vendors are pinned to their OWN vendorId, taken from the JWT and nowhere
 * else — no request parameter can widen it. Adding a customer-scoped order
 * read without going through this function is a review-blocking mistake: it
 * is the one spot where a slip leaks a competitor's business data.
 */
export function customerOrderScope(actor: AuthUser, customerId: string): Prisma.OrderWhereInput {
  if (actor.role === 'ADMIN') return { customerId };
  if (actor.role === 'VENDOR' && actor.vendorId) return { customerId, vendorId: actor.vendorId };
  // Fail closed: never fall through to an unscoped query.
  throw AppException.forbidden('Vendor scope required');
}

export function isPlatformScope(actor: AuthUser): boolean {
  return actor.role === 'ADMIN';
}

/** Vendor projection: no commission fields, no vendor identity. */
export const CUSTOMER_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  deliveryAddressText: true,
  deliveryMapsUrl: true,
  deliveryInstructions: true,
  deliveryCharge: true,
  currency: true,
  createdAt: true,
  deliveredAt: true,
} as const;

/** Admin projection: adds the vendor name and nothing else. */
export const ADMIN_CUSTOMER_ORDER_SELECT = {
  ...CUSTOMER_ORDER_SELECT,
  vendor: { select: { id: true, businessName: true } },
} as const;

type OrderRow = Record<string, unknown> & { vendor?: { businessName: string } | null };

/** Flattens the admin `vendor` relation into `vendorName` for the wire shape. */
export function flattenVendorName<T extends OrderRow>(row: T) {
  const { vendor, ...rest } = row;
  return vendor ? { ...rest, vendorName: vendor.businessName } : rest;
}
