import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { toMinorUnits, type AdminOrderListFilter, type CreateOrderInput, type OrderListFilter } from '@loadless/shared';
import type { Prisma } from '@prisma/client';
import { AppException } from '../common/app.exception';
import { cursorArgs, cursorResult } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import type { AuthUser } from '../auth/auth.types';
import { ORDER_EVENTS, type OrderCreatedEvent } from './order-events';

/** Vendors never see the commission split — that is platform/driver business. */
const VENDOR_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  deliveryAddressText: true,
  deliveryMapsUrl: true,
  deliveryLat: true,
  deliveryLng: true,
  deliveryCharge: true,
  currency: true,
  notes: true,
  deliveryInstructions: true,
  cancellationReason: true,
  createdAt: true,
  assignedAt: true,
  pickedUpAt: true,
  deliveredAt: true,
  cancelledAt: true,
  customer: { select: { id: true, name: true, normalizedPhone: true } },
  driver: { select: { id: true, fullName: true, contactPhone: true } },
} as const;

const DRIVER_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  deliveryAddressText: true,
  deliveryMapsUrl: true,
  deliveryLat: true,
  deliveryLng: true,
  deliveryCharge: true,
  currency: true,
  driverEarnings: true,
  deliveryInstructions: true,
  createdAt: true,
  assignedAt: true,
  pickedUpAt: true,
  deliveredAt: true,
  failureReason: true,
  vendor: { select: { id: true, businessName: true, logoKey: true } },
  customer: { select: { name: true, normalizedPhone: true } },
} as const;

/** The PENDING feed hides the customer's identity until a driver commits. */
const DRIVER_FEED_SELECT = {
  id: true,
  orderNumber: true,
  deliveryAddressText: true,
  deliveryMapsUrl: true,
  deliveryLat: true,
  deliveryLng: true,
  deliveryCharge: true,
  currency: true,
  deliveryInstructions: true,
  createdAt: true,
  vendor: { select: { id: true, businessName: true, logoKey: true } },
} as const;

const ADMIN_ORDER_SELECT = {
  ...VENDOR_ORDER_SELECT,
  commissionBps: true,
  platformCommissionAmount: true,
  driverEarnings: true,
  failureReason: true,
  cancelledByType: true,
  vendor: { select: { id: true, businessName: true } },
  statusHistory: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      actorType: true,
      reason: true,
      createdAt: true,
    },
  },
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly events: EventEmitter2,
  ) {}

  // ---------------------------------------------------------------- create

  async create(input: CreateOrderInput, vendorId: string, actor: AuthUser) {
    const chargeMinor = toMinorUnits(input.deliveryCharge, input.currency);
    if (chargeMinor === null || chargeMinor <= 0n) {
      throw AppException.validation([{ field: 'deliveryCharge', message: 'Invalid amount' }]);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const customer = await this.customers.upsertInTx(tx, input.customerPhone, input.customerName, actor);

      if (input.saveAddressToCustomer) {
        // One write path for both the explicit "add address" route and this
        // one: deduped, labelled, and change-history logged.
        await this.customers.saveAddressInTx(
          tx,
          customer.id,
          {
            addressText: input.deliveryAddressText,
            mapsUrl: input.deliveryMapsUrl,
            lat: input.deliveryLat,
            lng: input.deliveryLng,
            label: input.saveAddressLabel,
          },
          actor,
        );
      }

      const [{ nextval }] = await tx.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
      const orderNumber = `ORD-${new Date().getFullYear()}-${String(nextval).padStart(6, '0')}`;

      const order = await tx.order.create({
        data: {
          orderNumber,
          vendorId,
          customerId: customer.id,
          deliveryAddressText: input.deliveryAddressText,
          deliveryMapsUrl: input.deliveryMapsUrl,
          deliveryLat: input.deliveryLat,
          deliveryLng: input.deliveryLng,
          deliveryCharge: chargeMinor,
          currency: input.currency,
          notes: input.notes,
          deliveryInstructions: input.deliveryInstructions,
        },
        select: {
          id: true,
          orderNumber: true,
          vendorId: true,
          deliveryAddressText: true,
          deliveryCharge: true,
          currency: true,
          createdAt: true,
          vendor: { select: { businessName: true } },
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: null,
          toStatus: 'PENDING',
          actorType: actor.role,
          actorUserId: actor.userId,
        },
      });
      return order;
    });

    this.events.emit(ORDER_EVENTS.CREATED, {
      orderId: created.id,
      orderNumber: created.orderNumber,
      vendorId: created.vendorId,
      vendorName: created.vendor.businessName,
      deliveryAddressText: created.deliveryAddressText,
      deliveryCharge: created.deliveryCharge,
      currency: created.currency,
      createdAt: created.createdAt,
    } satisfies OrderCreatedEvent);

    return this.vendorGet(created.id, created.vendorId);
  }

  // ---------------------------------------------------------------- vendor

  async vendorList(vendorId: string, filter: OrderListFilter) {
    const where: Prisma.OrderWhereInput = {
      vendorId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.from || filter.to
        ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
        : {}),
    };
    const rows = await this.prisma.order.findMany({
      where,
      select: VENDOR_ORDER_SELECT,
      ...cursorArgs(filter),
    });
    return cursorResult(rows, filter.limit);
  }

  async vendorGet(orderId: string, vendorId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, vendorId }, // scoping in the WHERE: foreign order = not found
      select: {
        ...VENDOR_ORDER_SELECT,
        statusHistory: {
          orderBy: { createdAt: 'asc' as const },
          select: { id: true, fromStatus: true, toStatus: true, actorType: true, reason: true, createdAt: true },
        },
      },
    });
    if (!order) throw AppException.notFound('Order not found');
    return order;
  }

  // ---------------------------------------------------------------- driver

  async availableFeed(filter: { cursor?: string; limit: number }) {
    const rows = await this.prisma.order.findMany({
      where: { status: 'PENDING' },
      select: DRIVER_FEED_SELECT,
      ...cursorArgs(filter),
    });
    return cursorResult(rows, filter.limit);
  }

  async driverList(driverId: string, scope: 'active' | 'history', filter: { cursor?: string; limit: number }) {
    const rows = await this.prisma.order.findMany({
      where: {
        driverId,
        status:
          scope === 'active'
            ? { in: ['DRIVER_ASSIGNED', 'PICKED_UP'] }
            : { in: ['DELIVERED', 'FAILED'] },
      },
      select: DRIVER_ORDER_SELECT,
      ...cursorArgs(filter),
    });
    return cursorResult(rows, filter.limit);
  }

  async driverGet(orderId: string, driverId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, driverId },
      select: DRIVER_ORDER_SELECT,
    });
    if (!order) throw AppException.notFound('Order not found');
    return order;
  }

  // ----------------------------------------------------------------- admin

  async adminList(filter: AdminOrderListFilter) {
    const where: Prisma.OrderWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.vendorId ? { vendorId: filter.vendorId } : {}),
      ...(filter.driverId ? { driverId: filter.driverId } : {}),
      ...(filter.currency ? { currency: filter.currency } : {}),
      ...(filter.from || filter.to
        ? { createdAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } }
        : {}),
    };
    const rows = await this.prisma.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        deliveryCharge: true,
        currency: true,
        platformCommissionAmount: true,
        driverEarnings: true,
        createdAt: true,
        vendor: { select: { id: true, businessName: true } },
        driver: { select: { id: true, fullName: true } },
        customer: { select: { name: true, normalizedPhone: true } },
      },
      ...cursorArgs(filter),
    });
    return cursorResult(rows, filter.limit);
  }

  async adminGet(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: ADMIN_ORDER_SELECT,
    });
    if (!order) throw AppException.notFound('Order not found');
    return order;
  }
}
