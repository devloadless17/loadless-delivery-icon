import { Injectable } from '@nestjs/common';
import { Prisma, type OrderStatus } from '@prisma/client';
import type { CustomerOrderHistoryFilter } from '@loadless/shared';
import { AppException } from '../common/app.exception';
import { cursorArgs, cursorResult } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { CUSTOMER_SELECT, projectCustomer } from './customer.select';
import {
  ADMIN_CUSTOMER_ORDER_SELECT,
  CUSTOMER_ORDER_SELECT,
  customerOrderScope,
  flattenVendorName,
  isPlatformScope,
  vendorCustomerScope,
} from './customer-order.scope';

/** How many recent orders ride along inside the profile payload. */
const RECENT_ORDERS = 5;

interface TopAddressRow {
  address_text: string;
  maps_url: string | null;
  order_count: bigint;
  last_used_at: Date;
}

/**
 * Read side of the customer record: the "who am I talking to" payload a vendor
 * needs mid-phone-call, assembled in ONE round trip so the panel paints without
 * a spinner. Writes and change-history stay in CustomersService.
 *
 * Every order-derived number is scoped through customerOrderScope() — a vendor
 * sees only their own trade with this customer. The single exception is
 * totalOrdersPlatform, a bare integer that tells the vendor the customer is
 * established without revealing anything about who else serves them.
 */
@Injectable()
export class CustomerProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /** Unknown phone is a valid answer (null), never a 404. */
  async byPhone(normalizedPhone: string, actor: AuthUser) {
    const found = await this.prisma.customer.findUnique({
      where: { normalizedPhone },
      select: { id: true },
    });
    return found ? this.build(found.id, actor) : null;
  }

  async build(customerId: string, actor: AuthUser) {
    const scope = customerOrderScope(actor, customerId);
    const platform = isPlatformScope(actor);
    // Same JWT-only boundary as the order scope, on the link table.
    const myVendorId = platform ? null : vendorCustomerScope(actor);
    // Interpolated only from the JWT claim, never from request input.
    const vendorFilter = platform
      ? Prisma.empty
      : Prisma.sql`AND o."vendor_id" = ${actor.vendorId}`;

    // Bound to consts first: Prisma's conditional groupBy types resolve at the
    // call site, and the $transaction tuple then keeps them precise.
    const customerQuery = this.prisma.customer.findUnique({
      where: { id: customerId },
      select: CUSTOMER_SELECT,
    });
    // Establishedness across the platform: a count, and nothing else.
    const platformCountQuery = this.prisma.order.count({ where: { customerId } });
    // Status counts + first/last order in one pass (max 6 rows back).
    const byStatusQuery = this.prisma.order.groupBy({
      by: ['status'],
      where: scope,
      orderBy: { status: 'asc' },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { createdAt: true },
    });
    // Money, grouped BY CURRENCY. LBP and USD never merge.
    const spendQuery = this.prisma.order.groupBy({
      by: ['currency'],
      where: { ...scope, status: 'DELIVERED' },
      orderBy: { currency: 'asc' },
      _count: { _all: true },
      _sum: { deliveryCharge: true },
    });
    // The caller's relationship rows. For a VENDOR the where pins their own
    // vendorId, so at most one row comes back and it is theirs — this is the
    // same JWT-only boundary as customerOrderScope, expressed on the link
    // table. For ADMIN it is every vendor who deals with this customer.
    const linksQuery = this.prisma.customerVendor.findMany({
      where: myVendorId ? { customerId, vendorId: myVendorId } : { customerId },
      select: {
        vendorId: true,
        displayName: true,
        ordersCount: true,
        lastOrderAt: true,
        vendor: { select: { businessName: true } },
      },
      orderBy: [{ ordersCount: 'desc' }, { vendorId: 'asc' }],
    });
    const recentQuery = this.prisma.order.findMany({
      where: scope,
      select: platform ? ADMIN_CUSTOMER_ORDER_SELECT : CUSTOMER_ORDER_SELECT,
      ...cursorArgs({ limit: RECENT_ORDERS }),
    });
    // "Usual address" — grouped on the ORDER snapshot, because saved addresses
    // can duplicate while order history cannot lie. The GROUP BY expression
    // mirrors normalizeAddressKey() in @loadless/shared.
    const topAddressQuery = this.prisma.$queryRaw<TopAddressRow[]>`
      SELECT
        (array_agg(o."delivery_address_text" ORDER BY o."created_at" DESC))[1] AS address_text,
        (array_agg(o."delivery_maps_url" ORDER BY o."created_at" DESC)
           FILTER (WHERE o."delivery_maps_url" IS NOT NULL))[1]                AS maps_url,
        COUNT(*)                                                              AS order_count,
        MAX(o."created_at")                                                   AS last_used_at
      FROM "orders" o
      WHERE o."customer_id" = ${customerId} ${vendorFilter}
      GROUP BY lower(btrim(regexp_replace(o."delivery_address_text", '\\s+', ' ', 'g')))
      ORDER BY COUNT(*) DESC, MAX(o."created_at") DESC
      LIMIT 1`;

    // One round trip, one snapshot — so the platform count and the scoped
    // counts can never disagree with each other.
    const [customer, totalOrdersPlatform, byStatus, spend, links, recentRows, topAddressRows] =
      await this.prisma.$transaction([
        customerQuery,
        platformCountQuery,
        byStatusQuery,
        spendQuery,
        linksQuery,
        recentQuery,
        topAddressQuery,
      ]);

    if (!customer) throw AppException.notFound('Customer not found');

    const countOf = (status: OrderStatus) =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;
    const pickDate = (key: '_min' | '_max') =>
      byStatus
        .map((row) => row[key].createdAt)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => (key === '_min' ? +a - +b : +b - +a))[0] ?? null;

    const recent = cursorResult(recentRows, RECENT_ORDERS);
    const top = topAddressRows[0];

    // A vendor's own row is the only one they can have; ADMIN has none.
    const alias = myVendorId
      ? (links.find((l) => l.vendorId === myVendorId)?.displayName ?? null)
      : null;

    return {
      ...projectCustomer(actor, customer, alias),
      // ADMIN only: who else serves this customer. A vendor asking the same
      // question gets nothing — that list IS the competitive information.
      ...(platform
        ? {
            vendorLinks: links.map((l) => ({
              vendorId: l.vendorId,
              businessName: l.vendor.businessName,
              displayName: l.displayName,
              ordersCount: l.ordersCount,
              lastOrderAt: l.lastOrderAt,
              isCreator: l.vendorId === customer.createdByVendorId,
            })),
          }
        : {}),
      stats: {
        scope: platform ? ('PLATFORM' as const) : ('VENDOR' as const),
        totalOrdersPlatform,
        ordersInScope: byStatus.reduce((sum, row) => sum + row._count._all, 0),
        firstOrderAt: pickDate('_min'),
        lastOrderAt: pickDate('_max'),
        delivered: countOf('DELIVERED'),
        cancelled: countOf('CANCELLED'),
        failed: countOf('FAILED'),
        inProgress: countOf('PENDING') + countOf('DRIVER_ASSIGNED') + countOf('PICKED_UP'),
        deliveredSpend: spend.map((row) => ({
          currency: row.currency,
          amount: (row._sum.deliveryCharge ?? 0n).toString(),
          orders: row._count._all,
        })),
        topAddress: top
          ? {
              addressText: top.address_text,
              mapsUrl: top.maps_url,
              // COUNT(*) arrives as bigint; without this it serializes as a string.
              orderCount: Number(top.order_count),
              lastUsedAt: top.last_used_at,
            }
          : null,
      },
      recentOrders: recent.data.map(flattenVendorName),
      recentOrdersNextCursor: recent.meta.nextCursor,
    };
  }

  /** Full, cursor-paginated history — same scope, same projection switch. */
  async listOrders(customerId: string, actor: AuthUser, filter: CustomerOrderHistoryFilter) {
    const exists = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!exists) throw AppException.notFound('Customer not found');

    const rows = await this.prisma.order.findMany({
      where: {
        ...customerOrderScope(actor, customerId),
        ...(filter.status ? { status: filter.status } : {}),
      },
      select: isPlatformScope(actor) ? ADMIN_CUSTOMER_ORDER_SELECT : CUSTOMER_ORDER_SELECT,
      ...cursorArgs(filter),
    });
    const page = cursorResult(rows, filter.limit);
    return { data: page.data.map(flattenVendorName), meta: page.meta };
  }
}
