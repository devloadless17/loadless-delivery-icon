import type { Currency, OrderStatus } from '@prisma/client';

/**
 * Internal domain events, emitted AFTER the transaction commits. The realtime
 * gateway maps them to socket rooms; nothing else may emit socket traffic.
 */
export const ORDER_EVENTS = {
  CREATED: 'order.created',
  ASSIGNED: 'order.assigned',
  PICKED_UP: 'order.picked_up',
  DELIVERED: 'order.delivered',
  CANCELLED: 'order.cancelled',
  FAILED: 'order.failed',
  RELEASED: 'order.released',
} as const;

export interface OrderCreatedEvent {
  orderId: string;
  orderNumber: string;
  vendorId: string;
  vendorName: string;
  deliveryAddressText: string;
  deliveryCharge: bigint;
  currency: Currency;
  createdAt: Date;
}

export interface OrderAssignedEvent {
  orderId: string;
  vendorId: string;
  driverId: string;
  driverName: string;
  assignedAt: Date;
}

export interface OrderStatusEvent {
  orderId: string;
  vendorId: string;
  driverId: string | null;
  status: OrderStatus;
  at: Date;
}

export interface OrderCancelledEvent extends OrderStatusEvent {
  wasAssigned: boolean;
}

export interface OrderReleasedEvent {
  orderId: string;
  vendorId: string;
  previousDriverId: string;
  at: Date;
}
