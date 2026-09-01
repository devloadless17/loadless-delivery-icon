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

// ---------------------------------------------------------------------------
// The vendor <-> customer relationship, scoped the same way and in the same
// file, so there stays exactly ONE place to audit for cross-vendor leaks.
// ---------------------------------------------------------------------------

/**
 * The vendorId for every "my customers" read and every alias write.
 *
 * It comes from the JWT and nowhere else. This is the single most
 * security-critical value in the customer feature: it is all that stands
 * between a vendor and a name-searchable directory of every shop's clientele —
 * the exact capability the product deliberately withholds.
 *
 * ADMIN is rejected rather than widened: an admin has no customer list of
 * their own, and silently returning every link row would turn a mistake in a
 * controller into a data leak.
 */
export function vendorCustomerScope(actor: AuthUser): string {
  if (actor.role !== 'VENDOR' || !actor.vendorId) {
    throw AppException.forbidden('Vendor scope required');
  }
  return actor.vendorId;
}

/** ADMIN-only: narrow the customer directory to one vendor's customers. */
export function adminVendorLinkFilter(vendorId?: string): Prisma.CustomerWhereInput {
  return vendorId ? { vendorLinks: { some: { vendorId } } } : {};
}

/**
 * Resolve the name to show and whose name a save would rewrite.
 * A vendor with no alias FOLLOWS the base name, so an admin's correction
 * reaches every shop that has not chosen its own label.
 */
export function resolveCustomerName(
  actor: AuthUser,
  base: { name: string; createdByVendorId: string | null },
  alias: string | null,
) {
  const isAdmin = actor.role === 'ADMIN';
  return {
    name: alias ?? base.name,
    baseName: base.name,
    displayName: alias,
    // Only ADMIN writes the shared name. A vendor's pen reaches their own
    // private label and nothing else — whether or not they added the customer.
    nameScope: (isAdmin ? 'GLOBAL' : 'MINE') as 'GLOBAL' | 'MINE',
    // Informational only now: it drives the "Added by you" badge.
    addedByYou: !isAdmin && !!actor.vendorId && base.createdByVendorId === actor.vendorId,
  };
}

/**
 * Who may edit an address, from the caller's point of view. Never leaks the
 * owning vendor's id to another vendor — only the verdict.
 */
export function addressOwnership(
  actor: AuthUser,
  ownerVendorId: string | null,
): 'MINE' | 'OTHER' | 'PLATFORM' {
  if (ownerVendorId === null) return 'PLATFORM';
  if (actor.role === 'VENDOR' && actor.vendorId === ownerVendorId) return 'MINE';
  return 'OTHER';
}
