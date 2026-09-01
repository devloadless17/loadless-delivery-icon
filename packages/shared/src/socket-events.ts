import type { Currency } from './money';
import type { DutyStatus, OrderStatus } from './enums';

/**
 * Socket.IO contract — server-to-client only in v1. Payloads are minimal
 * notifications; the REST API + database remain the source of truth and
 * clients refetch on receipt / reconnect.
 */
export const SOCKET_EVENTS = {
  ORDER_CREATED: 'order.created',
  ORDER_ASSIGNED: 'order.assigned',
  ORDER_PICKED_UP: 'order.picked_up',
  ORDER_DELIVERED: 'order.delivered',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_FAILED: 'order.failed',
  ORDER_RELEASED: 'order.released',
  DRIVER_DUTY_CHANGED: 'driver.duty_changed',
  SESSION_REVOKED: 'session.revoked',
  SETTLEMENT_RECORDED: 'settlement.recorded',
  SETTLEMENT_VOIDED: 'settlement.voided',
} as const;
export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  vendorId: string;
  vendorName: string;
  deliveryAddressText: string;
  deliveryCharge: string; // BigInt serialized as string
  currency: Currency;
  createdAt: string;
}

export interface OrderAssignedPayload {
  orderId: string;
  vendorId: string;
  driverId: string;
  driverName: string;
  assignedAt: string;
}

export interface OrderStatusChangedPayload {
  orderId: string;
  vendorId: string;
  driverId: string | null;
  status: OrderStatus;
  at: string;
}

export interface OrderCancelledPayload extends OrderStatusChangedPayload {
  wasAssigned: boolean;
}

export interface OrderReleasedPayload {
  orderId: string;
  vendorId: string;
  previousDriverId: string;
  at: string;
}

export interface DriverDutyChangedPayload {
  driverId: string;
  dutyStatus: DutyStatus;
  at: string;
}

/**
 * A cash handover was recorded. Reaches the admin room and the driver's own
 * room so his phone shows "all settled" without him refreshing — he is standing
 * right there when it happens.
 */
export interface SettlementRecordedPayload {
  settlementId: string;
  settlementNumber: string;
  driverId: string;
  at: string;
}

export interface SettlementVoidedPayload {
  settlementId: string;
  settlementNumber: string;
  driverId: string;
  at: string;
}

export interface SessionRevokedPayload {
  reason: 'DEACTIVATED' | 'LOGGED_OUT' | 'TOKEN_REUSE';
}

export interface ServerToClientEvents {
  [SOCKET_EVENTS.ORDER_CREATED]: (payload: OrderCreatedPayload) => void;
  [SOCKET_EVENTS.ORDER_ASSIGNED]: (payload: OrderAssignedPayload) => void;
  [SOCKET_EVENTS.ORDER_PICKED_UP]: (payload: OrderStatusChangedPayload) => void;
  [SOCKET_EVENTS.ORDER_DELIVERED]: (payload: OrderStatusChangedPayload) => void;
  [SOCKET_EVENTS.ORDER_CANCELLED]: (payload: OrderCancelledPayload) => void;
  [SOCKET_EVENTS.ORDER_FAILED]: (payload: OrderStatusChangedPayload) => void;
  [SOCKET_EVENTS.ORDER_RELEASED]: (payload: OrderReleasedPayload) => void;
  [SOCKET_EVENTS.DRIVER_DUTY_CHANGED]: (payload: DriverDutyChangedPayload) => void;
  [SOCKET_EVENTS.SESSION_REVOKED]: (payload: SessionRevokedPayload) => void;
  [SOCKET_EVENTS.SETTLEMENT_RECORDED]: (payload: SettlementRecordedPayload) => void;
  [SOCKET_EVENTS.SETTLEMENT_VOIDED]: (payload: SettlementVoidedPayload) => void;
}

/** Room naming — used by the gateway; clients never join rooms themselves. */
export const SOCKET_ROOMS = {
  admin: 'admin',
  availableOrders: 'available-orders',
  user: (userId: string) => `user:${userId}`,
  vendor: (vendorId: string) => `vendor:${vendorId}`,
  driver: (driverId: string) => `driver:${driverId}`,
} as const;
