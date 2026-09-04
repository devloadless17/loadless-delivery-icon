import { z } from 'zod';
import { CURRENCIES, DEFAULT_CURRENCY, describeAmountProblem, toMinorUnits } from '../money';
import { ADDRESS_LABELS, ORDER_STATUSES } from '../enums';
import {
  cuidSchema,
  cursorPaginationSchema,
  phoneSchema,
  reasonSchema,
} from './common';
import { customerAddressInputSchema, latitudeSchema, longitudeSchema, mapsUrlSchema } from './customers';

/**
 * Vendor order creation. The customer is referenced by normalized phone —
 * the API upserts the global customer record. The delivery location is a
 * per-order snapshot and never mutates the customer profile.
 */
export const createOrderSchema = z.object({
  customerPhone: phoneSchema,
  /** Required when the phone is unknown to the platform (new customer). */
  customerName: z.string().trim().min(2).max(120).optional(),
  /** Optionally persist the delivery location to the customer's saved addresses. */
  saveAddressToCustomer: z.boolean().default(false),
  /** Label for the saved copy; omitted -> HOME for a first address, else OTHER. */
  saveAddressLabel: z.enum(ADDRESS_LABELS).optional(),

  /** Text OR a maps link is enough — see the superRefine below. */
  deliveryAddressText: z.string().trim().min(3).max(500).optional(),
  /** The Google Maps link the customer sent for THIS delivery. */
  deliveryMapsUrl: mapsUrlSchema.optional(),
  deliveryLat: latitudeSchema.optional(),
  deliveryLng: longitudeSchema.optional(),

  currency: z.enum(CURRENCIES).default(DEFAULT_CURRENCY),
  /** Major units as entered ("150000" LBP, "12.50" USD) -> validated into minor units. */
  deliveryCharge: z
    .string()
    .trim()
    .min(1, 'Delivery charge is required'),

  deliveryInstructions: z.string().trim().max(1000).optional(),
})
  .superRefine((order, ctx) => {
    const minor = toMinorUnits(order.deliveryCharge, order.currency);
    if (minor === null || minor <= 0n) {
      ctx.addIssue({
        code: 'custom',
        path: ['deliveryCharge'],
        // Names the actual problem — a comma, too many decimals, too large —
        // rather than leaving the vendor to guess mid-call.
        message:
          describeAmountProblem(order.deliveryCharge, order.currency) ??
          'Enter a valid positive amount',
      });
    }
    if (!order.deliveryAddressText && !order.deliveryMapsUrl) {
      ctx.addIssue({
        code: 'custom',
        path: ['deliveryAddressText'],
        message: 'Add an address or paste a Google Maps link',
      });
    }
  });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderReasonSchema = z.object({ reason: reasonSchema });
export type OrderReasonInput = z.infer<typeof orderReasonSchema>;

export const adminAssignOrderSchema = z.object({ driverId: cuidSchema });
export const adminReassignOrderSchema = z.object({
  driverId: cuidSchema,
  reason: reasonSchema,
});

export const orderListFilterSchema = cursorPaginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type OrderListFilter = z.infer<typeof orderListFilterSchema>;

export const adminOrderListFilterSchema = orderListFilterSchema.extend({
  vendorId: cuidSchema.optional(),
  driverId: cuidSchema.optional(),
  currency: z.enum(CURRENCIES).optional(),
});
export type AdminOrderListFilter = z.infer<typeof adminOrderListFilterSchema>;

// Referenced so the customers import group stays cohesive for consumers.
export { customerAddressInputSchema };
