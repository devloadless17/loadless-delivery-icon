'use client';

import { fromMinorUnits, type Currency } from '@loadless/shared';
import type { CustomerOrder, CustomerProfile } from '@/features/customers/api';

/**
 * A pre-filled order handed from the customer profile to the order form —
 * the "same as last time" path.
 *
 * Carried in sessionStorage rather than the URL: a Google Maps link is 100+
 * encoded characters as a query param, and a refresh or back-navigation would
 * silently clobber edits the vendor already made. The `?repeat=1&phone=` flag
 * keeps the link meaningful even when storage is empty (PWA cold start).
 */
export interface OrderDraft {
  customerPhone: string;
  addressText: string;
  mapsUrl?: string | null;
  charge?: string;
  currency?: Currency;
  deliveryInstructions?: string | null;
  sourceOrderNumber?: string;
}

const KEY = 'loadless.order-draft';

export function stashOrderDraft(draft: OrderDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private mode / storage disabled — the ?phone= fallback still works.
  }
}

/** Read-and-remove: a draft applies exactly once. */
export function takeOrderDraft(): OrderDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    return JSON.parse(raw) as OrderDraft;
  } catch {
    return null;
  }
}

export function draftFromOrder(order: CustomerOrder, customer: CustomerProfile): OrderDraft {
  return {
    customerPhone: customer.normalizedPhone,
    addressText: order.deliveryAddressText ?? '',
    mapsUrl: order.deliveryMapsUrl,
    // Orders store minor units; the amount input takes major units.
    charge: fromMinorUnits(order.deliveryCharge, order.currency),
    currency: order.currency,
    deliveryInstructions: order.deliveryInstructions,
    sourceOrderNumber: order.orderNumber,
  };
}
