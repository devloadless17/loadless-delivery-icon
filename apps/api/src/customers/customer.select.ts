/**
 * One definition of a customer's shape, shared by the write service and the
 * read (profile) service so the two can never drift apart.
 */
export const ADDRESS_SELECT = {
  id: true,
  label: true,
  addressText: true,
  mapsUrl: true,
  lat: true,
  lng: true,
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
