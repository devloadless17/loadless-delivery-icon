import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ERROR_CODES } from '@loadless/shared';
import type { OrderStatus, Prisma } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { OrderFinancialsService } from './order-financials.service';
import {
  ORDER_EVENTS,
  type OrderAssignedEvent,
  type OrderCancelledEvent,
  type OrderReleasedEvent,
  type OrderStatusEvent,
} from './order-events';

/**
 * Every status change in the system goes through this service. The pattern is
 * always the same: a conditional atomic updateMany whose WHERE clause carries
 * the FULL guard (current status + driver identity + ownership), a history row
 * written in the same transaction, and domain events emitted only after commit.
 * `count === 0` means someone else won the race — never an exception to retry.
 */
@Injectable()
export class OrderLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financials: OrderFinancialsService,
    private readonly events: EventEmitter2,
  ) {}

  // ---------------------------------------------------------------- accept

  async accept(orderId: string, driverId: string, actor: AuthUser) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true, fullName: true, status: true, dutyStatus: true, commissionOverrideBps: true, userId: true },
    });
    if (!driver || driver.status !== 'ACTIVE') {
      throw new AppException(ERROR_CODES.DRIVER_NOT_AVAILABLE, 'Driver is not active', HttpStatus.FORBIDDEN);
    }
    // Self-accept requires being on duty; an admin manually assigning does not.
    if (actor.role === 'DRIVER' && driver.dutyStatus !== 'ON_DUTY') {
      throw new AppException(ERROR_CODES.DRIVER_NOT_AVAILABLE, 'Go on duty to accept orders', HttpStatus.FORBIDDEN);
    }

    const bps = await this.financials.resolveCommissionBps(driver.commissionOverrideBps);

    const result = await this.prisma.$transaction(async (tx) => {
      // Re-check the driver INSIDE the transaction, holding his row.
      //
      // The checks above run before the transaction opens, and the guarded
      // updateMany below only guards the ORDER — status, driverId. So an admin
      // suspending a driver in the window between the two still ended with the
      // order assigned to a suspended driver, carrying a real commission
      // snapshot. FOR UPDATE makes the two operations take turns: the suspend
      // waits for this commit, or it got there first and we read the new value
      // and refuse. Only this driver's row is locked, so unrelated accepts are
      // unaffected.
      const [current] = await tx.$queryRaw<Array<{ status: string; duty_status: string }>>`
        SELECT "status", "duty_status" FROM "drivers" WHERE "id" = ${driverId} FOR UPDATE
      `;
      if (!current || current.status !== 'ACTIVE') {
        throw new AppException(
          ERROR_CODES.DRIVER_NOT_AVAILABLE,
          'Driver is not active',
          HttpStatus.FORBIDDEN,
        );
      }
      if (actor.role === 'DRIVER' && current.duty_status !== 'ON_DUTY') {
        throw new AppException(
          ERROR_CODES.DRIVER_NOT_AVAILABLE,
          'Go on duty to accept orders',
          HttpStatus.FORBIDDEN,
        );
      }

      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { deliveryCharge: true, vendorId: true },
      });
      if (!order) throw AppException.notFound('Order not found');

      const snapshot = this.financials.computeSnapshot(order.deliveryCharge, bps);
      const assignedAt = new Date();

      const res = await tx.order.updateMany({
        where: { id: orderId, status: 'PENDING', driverId: null },
        data: {
          status: 'DRIVER_ASSIGNED',
          driverId,
          commissionBps: snapshot.commissionBps,
          platformCommissionAmount: snapshot.platformCommissionAmount,
          driverEarnings: snapshot.driverEarnings,
          assignedAt,
        },
      });
      if (res.count === 0) {
        throw new AppException(
          ERROR_CODES.ORDER_NO_LONGER_AVAILABLE,
          'This order is no longer available',
          HttpStatus.CONFLICT,
        );
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: 'PENDING',
          toStatus: 'DRIVER_ASSIGNED',
          actorType: actor.role,
          actorUserId: actor.userId,
          metadata: {
            driverId,
            commissionBps: snapshot.commissionBps,
            platformCommissionAmount: snapshot.platformCommissionAmount.toString(),
            driverEarnings: snapshot.driverEarnings.toString(),
          },
        },
      });

      return { vendorId: order.vendorId, assignedAt };
    });

    this.events.emit(ORDER_EVENTS.ASSIGNED, {
      orderId,
      vendorId: result.vendorId,
      driverId,
      driverName: driver.fullName,
      assignedAt: result.assignedAt,
    } satisfies OrderAssignedEvent);

    return this.reload(orderId);
  }

  // ------------------------------------------------- pickup / deliver / fail

  async pickup(orderId: string, actor: AuthUser) {
    return this.driverTransition(orderId, actor, 'DRIVER_ASSIGNED', 'PICKED_UP', {
      pickedUpAt: new Date(),
    });
  }

  async deliver(orderId: string, actor: AuthUser) {
    return this.driverTransition(orderId, actor, 'PICKED_UP', 'DELIVERED', {
      deliveredAt: new Date(),
    });
  }

  async fail(orderId: string, reason: string, actor: AuthUser) {
    return this.driverTransition(
      orderId,
      actor,
      'PICKED_UP',
      'FAILED',
      { failureReason: reason },
      reason,
    );
  }

  /**
   * Shared guarded transition for the assigned driver (admin may act on any
   * driver's order). Idempotent by construction: a double-tap that finds the
   * order already in the target state (same driver) returns success without a
   * duplicate history row.
   */
  private async driverTransition(
    orderId: string,
    actor: AuthUser,
    from: OrderStatus,
    to: OrderStatus,
    data: Prisma.OrderUpdateManyMutationInput,
    reason?: string,
  ) {
    const driverScope = actor.role === 'DRIVER' ? { driverId: actor.driverId as string } : {};

    const outcome = await this.prisma.$transaction(async (tx) => {
      const res = await tx.order.updateMany({
        where: { id: orderId, status: from, ...driverScope },
        data: { status: to, ...data },
      });

      if (res.count === 0) {
        const current = await tx.order.findUnique({
          where: { id: orderId },
          select: { status: true, driverId: true, vendorId: true },
        });
        const mine =
          current && (actor.role !== 'DRIVER' || current.driverId === actor.driverId);
        if (!current || !mine) throw AppException.notFound('Order not found');
        if (current.status === to) return { idempotent: true as const, vendorId: current.vendorId, driverId: current.driverId };
        throw new AppException(
          ERROR_CODES.INVALID_STATE_TRANSITION,
          `Order is ${current.status.toLowerCase().replace('_', ' ')} — refresh to see the latest state`,
          HttpStatus.CONFLICT,
        );
      }

      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { vendorId: true, driverId: true },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: from,
          toStatus: to,
          actorType: actor.role,
          actorUserId: actor.userId,
          reason,
        },
      });
      return { idempotent: false as const, vendorId: order.vendorId, driverId: order.driverId };
    });

    if (!outcome.idempotent) {
      const eventName =
        to === 'PICKED_UP'
          ? ORDER_EVENTS.PICKED_UP
          : to === 'DELIVERED'
            ? ORDER_EVENTS.DELIVERED
            : ORDER_EVENTS.FAILED;
      this.events.emit(eventName, {
        orderId,
        vendorId: outcome.vendorId,
        driverId: outcome.driverId,
        status: to,
        at: new Date(),
      } satisfies OrderStatusEvent);
    }

    return this.reload(orderId);
  }

  // ---------------------------------------------------------------- release

  async release(orderId: string, reason: string, actor: AuthUser) {
    const driverScope = actor.role === 'DRIVER' ? { driverId: actor.driverId as string } : {};

    const outcome = await this.prisma.$transaction(async (tx) => {
      const before = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          status: true,
          driverId: true,
          vendorId: true,
          commissionBps: true,
          platformCommissionAmount: true,
          driverEarnings: true,
        },
      });
      const mine = before && (actor.role !== 'DRIVER' || before.driverId === actor.driverId);
      if (!before || !mine) throw AppException.notFound('Order not found');

      const res = await tx.order.updateMany({
        where: { id: orderId, status: 'DRIVER_ASSIGNED', ...driverScope },
        data: {
          status: 'PENDING',
          driverId: null,
          commissionBps: null,
          platformCommissionAmount: null,
          driverEarnings: null,
          assignedAt: null,
        },
      });
      if (res.count === 0) {
        throw new AppException(
          ERROR_CODES.INVALID_STATE_TRANSITION,
          'Only accepted orders that are not yet picked up can be released',
          HttpStatus.CONFLICT,
        );
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: 'DRIVER_ASSIGNED',
          toStatus: 'PENDING',
          actorType: actor.role,
          actorUserId: actor.userId,
          reason,
          metadata: {
            releasedDriverId: before.driverId,
            clearedSnapshot: {
              commissionBps: before.commissionBps,
              platformCommissionAmount: before.platformCommissionAmount?.toString(),
              driverEarnings: before.driverEarnings?.toString(),
            },
          },
        },
      });
      return { vendorId: before.vendorId, previousDriverId: before.driverId as string };
    });

    this.events.emit(ORDER_EVENTS.RELEASED, {
      orderId,
      vendorId: outcome.vendorId,
      previousDriverId: outcome.previousDriverId,
      at: new Date(),
    } satisfies OrderReleasedEvent);

    // The order is available again — tell on-duty drivers.
    const reloaded = await this.reload(orderId);
    this.events.emit(ORDER_EVENTS.CREATED, {
      orderId: reloaded.id,
      orderNumber: reloaded.orderNumber,
      vendorId: reloaded.vendorId,
      vendorName: reloaded.vendor.businessName,
      deliveryAddressText: reloaded.deliveryAddressText,
      deliveryCharge: reloaded.deliveryCharge,
      currency: reloaded.currency,
      createdAt: reloaded.createdAt,
    });
    return reloaded;
  }

  // ----------------------------------------------------------------- cancel

  /** Vendors may cancel ONLY while PENDING — the core business rule. */
  async vendorCancel(orderId: string, vendorId: string, reason: string, actor: AuthUser) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const res = await tx.order.updateMany({
        where: { id: orderId, vendorId, status: 'PENDING' },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason,
          cancelledByType: 'VENDOR',
          cancelledByUserId: actor.userId,
          cancelledAt: new Date(),
        },
      });
      if (res.count === 0) {
        const current = await tx.order.findUnique({
          where: { id: orderId },
          select: { vendorId: true, status: true },
        });
        if (!current || current.vendorId !== vendorId) throw AppException.notFound('Order not found');
        throw new AppException(
          ERROR_CODES.INVALID_STATE_TRANSITION,
          current.status === 'CANCELLED'
            ? 'This order is already cancelled'
            : 'A driver already took this order — contact the platform to cancel it',
          HttpStatus.CONFLICT,
        );
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: 'PENDING',
          toStatus: 'CANCELLED',
          actorType: 'VENDOR',
          actorUserId: actor.userId,
          reason,
        },
      });
      return { vendorId };
    });

    this.events.emit(ORDER_EVENTS.CANCELLED, {
      orderId,
      vendorId: outcome.vendorId,
      driverId: null,
      status: 'CANCELLED',
      at: new Date(),
      wasAssigned: false,
    } satisfies OrderCancelledEvent);

    return this.reload(orderId);
  }

  /** Admin may cancel any non-terminal order. */
  async adminCancel(orderId: string, reason: string, actor: AuthUser) {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const before = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, driverId: true, vendorId: true },
      });
      if (!before) throw AppException.notFound('Order not found');

      const res = await tx.order.updateMany({
        where: { id: orderId, status: { in: ['PENDING', 'DRIVER_ASSIGNED', 'PICKED_UP'] } },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason,
          cancelledByType: 'ADMIN',
          cancelledByUserId: actor.userId,
          cancelledAt: new Date(),
        },
      });
      if (res.count === 0) {
        throw new AppException(
          ERROR_CODES.INVALID_STATE_TRANSITION,
          `Order is already ${before.status.toLowerCase()}`,
          HttpStatus.CONFLICT,
        );
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: before.status,
          toStatus: 'CANCELLED',
          actorType: 'ADMIN',
          actorUserId: actor.userId,
          reason,
        },
      });
      return { vendorId: before.vendorId, driverId: before.driverId, wasAssigned: before.status !== 'PENDING' };
    });

    this.events.emit(ORDER_EVENTS.CANCELLED, {
      orderId,
      vendorId: outcome.vendorId,
      driverId: outcome.driverId,
      status: 'CANCELLED',
      at: new Date(),
      wasAssigned: outcome.wasAssigned,
    } satisfies OrderCancelledEvent);

    return this.reload(orderId);
  }

  // --------------------------------------------------------------- reassign

  /** Atomic driver swap; the snapshot is recomputed at the NEW driver's rate. */
  async adminReassign(orderId: string, newDriverId: string, reason: string, actor: AuthUser) {
    const newDriver = await this.prisma.driver.findUnique({
      where: { id: newDriverId },
      select: { id: true, fullName: true, status: true, commissionOverrideBps: true },
    });
    if (!newDriver || newDriver.status !== 'ACTIVE') {
      throw new AppException(ERROR_CODES.DRIVER_NOT_AVAILABLE, 'Driver is not active', HttpStatus.FORBIDDEN);
    }
    const bps = await this.financials.resolveCommissionBps(newDriver.commissionOverrideBps);

    const outcome = await this.prisma.$transaction(async (tx) => {
      // Same reason as accept(): the status check above is outside the
      // transaction, so without holding the row a suspension landing in the
      // window hands the order — and a freshly computed snapshot at his rate —
      // to a driver who is no longer allowed to carry it.
      const [current] = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT "status" FROM "drivers" WHERE "id" = ${newDriverId} FOR UPDATE
      `;
      if (!current || current.status !== 'ACTIVE') {
        throw new AppException(
          ERROR_CODES.DRIVER_NOT_AVAILABLE,
          'Driver is not active',
          HttpStatus.FORBIDDEN,
        );
      }

      const before = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, driverId: true, vendorId: true, deliveryCharge: true },
      });
      if (!before) throw AppException.notFound('Order not found');
      if (!before.driverId || (before.status !== 'DRIVER_ASSIGNED' && before.status !== 'PICKED_UP')) {
        throw new AppException(
          ERROR_CODES.INVALID_STATE_TRANSITION,
          'Only assigned orders can be reassigned',
          HttpStatus.CONFLICT,
        );
      }
      if (before.driverId === newDriverId) {
        throw new AppException(
          ERROR_CODES.CONFLICT,
          'The order is already assigned to this driver',
          HttpStatus.CONFLICT,
        );
      }

      const snapshot = this.financials.computeSnapshot(before.deliveryCharge, bps);
      const assignedAt = new Date();
      const res = await tx.order.updateMany({
        where: {
          id: orderId,
          status: { in: ['DRIVER_ASSIGNED', 'PICKED_UP'] },
          driverId: before.driverId,
        },
        data: {
          status: 'DRIVER_ASSIGNED',
          driverId: newDriverId,
          commissionBps: snapshot.commissionBps,
          platformCommissionAmount: snapshot.platformCommissionAmount,
          driverEarnings: snapshot.driverEarnings,
          assignedAt,
          pickedUpAt: null, // the new driver has not picked up
        },
      });
      if (res.count === 0) {
        throw new AppException(
          ERROR_CODES.CONFLICT,
          'The order changed while reassigning — check its current state',
          HttpStatus.CONFLICT,
        );
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: before.status,
          toStatus: 'DRIVER_ASSIGNED',
          actorType: 'ADMIN',
          actorUserId: actor.userId,
          reason,
          metadata: {
            reassignedFrom: before.driverId,
            reassignedTo: newDriverId,
            commissionBps: snapshot.commissionBps,
            driverEarnings: snapshot.driverEarnings.toString(),
          },
        },
      });
      return { vendorId: before.vendorId, previousDriverId: before.driverId, assignedAt };
    });

    this.events.emit(ORDER_EVENTS.RELEASED, {
      orderId,
      vendorId: outcome.vendorId,
      previousDriverId: outcome.previousDriverId,
      at: outcome.assignedAt,
    } satisfies OrderReleasedEvent);
    this.events.emit(ORDER_EVENTS.ASSIGNED, {
      orderId,
      vendorId: outcome.vendorId,
      driverId: newDriverId,
      driverName: newDriver.fullName,
      assignedAt: outcome.assignedAt,
    } satisfies OrderAssignedEvent);

    return this.reload(orderId);
  }

  // ------------------------------------------------------------------ util

  private reload(orderId: string) {
    return this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        vendorId: true,
        status: true,
        driverId: true,
        deliveryAddressText: true,
        deliveryCharge: true,
        currency: true,
        createdAt: true,
        vendor: { select: { businessName: true } },
      },
    });
  }
}
