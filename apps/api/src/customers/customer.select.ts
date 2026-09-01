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

/**
 * Who added an address is ADMIN-ONLY information.
 *
 * `ownership: 'OTHER'` can only ever mean "another vendor added this", so
 * shipping it to a vendor confirms that a competitor deals with this customer —
 * the one thing the shared-customer model exists to withhold. It bought them
 * nothing either: a vendor cannot edit or remove a saved address, so there is
 * no decision the verdict informs.
 */
export function projectAddress(actor: AuthUser, row: AddressRow) {
  const { createdByVendorId, createdByVendor, ...rest } = row;
  if (actor.role !== 'ADMIN') return rest;
  return {
    ...rest,
    ownership: addressOwnership(actor, createdByVendorId),
    ownerVendorName: createdByVendor?.businessName ?? null,
  };
}

/**
 * The wire shape of a customer: resolved name, the caller's own view of each
 * address, and no foreign vendor ids.
 *
 * `alias` is the caller's private name for this customer (null = follow the
 * global one). Addresses keep their natural (oldest-first) order for everyone:
 * sorting the caller's own to the top would itself say which rows are theirs
 * and, by elimination, which are another vendor's.
 */
export function projectCustomer(actor: AuthUser, row: CustomerRow, alias: string | null) {
  const { createdByVendorId, addresses, name, ...rest } = row;
  const addressViews = addresses.map((a) => projectAddress(actor, a));
  return {
    ...rest,
    ...resolveCustomerName(actor, { name, createdByVendorId }, alias),
    ...(actor.role === 'ADMIN' ? { createdByVendorId } : {}),
    addresses: addressViews,
  };
}
