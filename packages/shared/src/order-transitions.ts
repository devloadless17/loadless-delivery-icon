import type { ActorType, OrderStatus } from './enums';

/**
 * The order lifecycle as data — single source of truth shared by the API
 * state machine (enforcement) and the UI (which actions to render).
 *
 * `action` is the command name used in API routes (POST .../:id/<action>).
 * Reassign is intentionally absent: it is not a status change but an atomic
 * driver swap performed by admin while status stays DRIVER_ASSIGNED (or moves
 * back from PICKED_UP), handled as a dedicated admin command.
 */
export interface OrderTransition {
  action: OrderAction;
  from: readonly OrderStatus[];
  to: OrderStatus;
  actors: readonly ActorType[];
  /** true when only the driver assigned to the order may perform it */
  assignedDriverOnly?: boolean;
  /** true when a reason is mandatory */
  requiresReason?: boolean;
}

export const ORDER_ACTIONS = [
  'accept',
  'pickup',
  'deliver',
  'release',
  'cancel',
  'fail',
] as const;
export type OrderAction = (typeof ORDER_ACTIONS)[number];

export const ORDER_TRANSITIONS: readonly OrderTransition[] = [
  { action: 'accept', from: ['PENDING'], to: 'DRIVER_ASSIGNED', actors: ['DRIVER', 'ADMIN'] },
  {
    action: 'pickup',
    from: ['DRIVER_ASSIGNED'],
    to: 'PICKED_UP',
    actors: ['DRIVER', 'ADMIN'],
    assignedDriverOnly: true,
  },
  {
    action: 'deliver',
    from: ['PICKED_UP'],
    to: 'DELIVERED',
    actors: ['DRIVER', 'ADMIN'],
    assignedDriverOnly: true,
  },
  {
    action: 'release',
    from: ['DRIVER_ASSIGNED'],
    to: 'PENDING',
    actors: ['DRIVER', 'ADMIN'],
    assignedDriverOnly: true,
    requiresReason: true,
  },
  // Vendor may cancel ONLY while PENDING; admin may cancel any non-terminal state.
  {
    action: 'cancel',
    from: ['PENDING'],
    to: 'CANCELLED',
    actors: ['VENDOR', 'ADMIN'],
    requiresReason: true,
  },
  {
    action: 'cancel',
    from: ['DRIVER_ASSIGNED', 'PICKED_UP'],
    to: 'CANCELLED',
    actors: ['ADMIN'],
    requiresReason: true,
  },
  {
    action: 'fail',
    from: ['PICKED_UP'],
    to: 'FAILED',
    actors: ['DRIVER', 'ADMIN'],
    assignedDriverOnly: true,
    requiresReason: true,
  },
];

export function transitionsFor(status: OrderStatus, actor: ActorType): OrderTransition[] {
  return ORDER_TRANSITIONS.filter((t) => t.from.includes(status) && t.actors.includes(actor));
}

export function findTransition(
  action: OrderAction,
  status: OrderStatus,
  actor: ActorType,
): OrderTransition | undefined {
  return ORDER_TRANSITIONS.find(
    (t) => t.action === action && t.from.includes(status) && t.actors.includes(actor),
  );
}
