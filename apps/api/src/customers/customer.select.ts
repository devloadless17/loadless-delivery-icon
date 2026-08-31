import type { AuthUser } from '../auth/auth.types';
import { addressOwnership, resolveCustomerName } from './customer-order.scope';

/**
 * One definition of a customer's shape, shared by the write service and the
 * read (profile) service so the two can never drift apart.
 *
 * The selects deliberately fetch MORE than any vendor may see —
 * `createdByVendorId` decides ownership, so the service needs it — which is
 * why every route returns rows through `projectCustomer` / `projectAddress`
 * instead of shipping them raw. A vendor must never receive another vendor's
 * id: with enough customers it reconstructs a competitor's client list.
 */
export const ADDRESS_SELECT = {
  id: true,
  label: true,
  addressText: true,
  mapsUrl: true,
  lat: true,
  lng: true,
  createdByVendorId: true,
  createdByVendor: { select: { businessName: true } },
} as const;

export const CUSTOMER_SELECT = {
  id: true,
  normalizedPhone: true,
  name: true,
  createdByVendorId: true,
  createdAt: true,
  addresses: {
    where: { isArchived: false },
    orderBy: { createdAt: 'asc' as const },
    select: ADDRESS_SELECT,
  },
} as const;

interface AddressRow {
  id: string;
  label: string;
  addressText: string | null;
  mapsUrl: string | null;
  lat: number | null;
  lng: number | null;
  createdByVendorId: string | null;
  createdByVendor?: { businessName: string } | null;
}

interface CustomerRow {
  id: string;
  normalizedPhone: string;
  name: string;
  createdByVendorId: string | null;
  createdAt: Date;
  addresses: AddressRow[];
}

/** Strips the owning vendor's identity down to a verdict the caller may see. */
export function projectAddress(actor: AuthUser, row: AddressRow) {
  const { createdByVendorId, createdByVendor, ...rest } = row;
  return {
    ...rest,
    ownership: addressOwnership(actor, createdByVendorId),
    // Only an admin is told WHO owns a row; a vendor gets MINE / OTHER / PLATFORM.
    ...(actor.role === 'ADMIN'
      ? { ownerVendorName: createdByVendor?.businessName ?? null }
      : {}),
  };
}

/**
 * The wire shape of a customer: resolved name, the caller's own view of each
 * address, and no foreign vendor ids.
 *
 * `alias` is the caller's private name for this customer (null = follow the
 * global one). Addresses the caller owns sort first — they are the ones with
 * working Edit buttons, and burying them under read-only rows would read as
 * "I can't edit my own data".
 */
export function projectCustomer(actor: AuthUser, row: CustomerRow, alias: string | null) {
  const { createdByVendorId, addresses, name, ...rest } = row;
  const addressViews = addresses.map((a) => projectAddress(actor, a));
  addressViews.sort((a, b) => Number(b.ownership === 'MINE') - Number(a.ownership === 'MINE'));
  return {
    ...rest,
    ...resolveCustomerName(actor, { name, createdByVendorId }, alias),
    ...(actor.role === 'ADMIN' ? { createdByVendorId } : {}),
    addresses: addressViews,
  };
}
