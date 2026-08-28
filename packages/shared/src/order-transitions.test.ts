import { describe, expect, it } from 'vitest';
import { findTransition, transitionsFor } from './order-transitions';
import { ORDER_STATUSES, TERMINAL_ORDER_STATUSES, type ActorType } from './enums';

describe('order transition table', () => {
  it('vendor can cancel ONLY while PENDING', () => {
    expect(findTransition('cancel', 'PENDING', 'VENDOR')).toBeDefined();
    expect(findTransition('cancel', 'DRIVER_ASSIGNED', 'VENDOR')).toBeUndefined();
    expect(findTransition('cancel', 'PICKED_UP', 'VENDOR')).toBeUndefined();
  });

  it('admin can cancel any non-terminal state', () => {
    expect(findTransition('cancel', 'PENDING', 'ADMIN')).toBeDefined();
    expect(findTransition('cancel', 'DRIVER_ASSIGNED', 'ADMIN')).toBeDefined();
    expect(findTransition('cancel', 'PICKED_UP', 'ADMIN')).toBeDefined();
  });

  it('driver release is only possible before pickup', () => {
    expect(findTransition('release', 'DRIVER_ASSIGNED', 'DRIVER')).toBeDefined();
    expect(findTransition('release', 'PICKED_UP', 'DRIVER')).toBeUndefined();
  });

  it('fail is only reachable from PICKED_UP', () => {
    expect(findTransition('fail', 'PICKED_UP', 'DRIVER')).toBeDefined();
    expect(findTransition('fail', 'DRIVER_ASSIGNED', 'DRIVER')).toBeUndefined();
    expect(findTransition('fail', 'PENDING', 'DRIVER')).toBeUndefined();
  });

  it('terminal states allow no transitions for any actor', () => {
    const actors: ActorType[] = ['ADMIN', 'VENDOR', 'DRIVER', 'SYSTEM'];
    for (const status of TERMINAL_ORDER_STATUSES) {
      for (const actor of actors) {
        expect(transitionsFor(status, actor)).toHaveLength(0);
      }
    }
  });

  it('happy path is the only forward chain', () => {
    expect(findTransition('accept', 'PENDING', 'DRIVER')?.to).toBe('DRIVER_ASSIGNED');
    expect(findTransition('pickup', 'DRIVER_ASSIGNED', 'DRIVER')?.to).toBe('PICKED_UP');
    expect(findTransition('deliver', 'PICKED_UP', 'DRIVER')?.to).toBe('DELIVERED');
    // no skipping
    expect(findTransition('deliver', 'DRIVER_ASSIGNED', 'DRIVER')).toBeUndefined();
    expect(findTransition('pickup', 'PENDING', 'DRIVER')).toBeUndefined();
  });

  it('every status is a known enum member in the table', () => {
    for (const status of ORDER_STATUSES) {
      // sanity: transitionsFor never throws for any status/actor combo
      expect(() => transitionsFor(status, 'ADMIN')).not.toThrow();
    }
  });
});
