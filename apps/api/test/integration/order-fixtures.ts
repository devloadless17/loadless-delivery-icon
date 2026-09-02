import { calcCommission } from '@loadless/shared';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Building an order row by hand means satisfying THREE interlocking CHECK
 * constraints at once, which is why this is shared rather than retyped per
 * spec. Miss one and Postgres rejects the insert naming a constraint you were
 * not testing, which reads like the code under test is broken:
 *
 *   order_status_driver_coupling — PENDING must have NO driver and NO
 *     commission; DRIVER_ASSIGNED / PICKED_UP / DELIVERED / FAILED must have
 *     BOTH; CANCELLED may have either (it can be cancelled before or after
 *     assignment).
 *   order_delivered_has_timestamp — a DELIVERED row must carry deliveredAt.
 *     This is what keeps a delivery visible to the settlement sweep, which
 *     selects on `delivered_at <= cutoff` and would silently skip a NULL
 *     forever.
 *   order_ts_ordering — pickedUpAt implies assignedAt, deliveredAt implies
 *     pickedUpAt. So a DELIVERED row needs all three timestamps, not just the
 *     last one. This is the one that bites after the first two are fixed.
 *
 * The order number comes from the real sequence rather than an invented string,
 * so fixtures cannot collide with each other or with rows the app creates.
 *
 * Money defaults are internally consistent on purpose: 100000 at 3000bps gives
 * 30000 commission and 70000 earnings, i.e. earnings = charge - commission. A
 * fixture that violated that invariant would make any assertion about money
 * meaningless — which is also why the commission comes from shared's
 * calcCommission rather than a division written here.
 */
export type FixtureOrderStatus =
  | 'PENDING'
  | 'DRIVER_ASSIGNED'
  | 'PICKED_UP'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED';

export interface SeedOrderOptions {
  vendorId: string;
  customerId: string;
  /** Required for every status except PENDING; ignored there. */
  driverId?: string;
  status?: FixtureOrderStatus;
  charge?: bigint;
  currency?: 'LBP' | 'USD';
  commissionBps?: number;
  addressText?: string;
  createdAt?: Date;
  /** Overrides deliveredAt — pass null to build a row the DB should REJECT. */
  deliveredAt?: Date | null;
}

export async function seedOrder(prisma: PrismaService, opts: SeedOrderOptions) {
  const status = opts.status ?? 'DELIVERED';
  const charge = opts.charge ?? 100_000n;
  const bps = opts.commissionBps ?? 3000;
  // calcCommission, not a local division: it rounds half-up and this truncated.
  // They agree on round numbers and diverge by one minor unit the moment there
  // is a remainder (333 at 3000bps is 100, not 99), which builds an order the
  // platform would never have created and quietly makes any money assertion
  // about it a fiction. Shared is documented as the only commission math.
  const commission = calcCommission(charge, bps);

  // PENDING is the only status the coupling constraint requires to be bare.
  const assigned = status !== 'PENDING';
  if (assigned && !opts.driverId && status !== 'CANCELLED') {
    throw new Error(`seedOrder: status ${status} requires a driverId`);
  }

  const now = new Date();
  const seq = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;

  return prisma.order.create({
    data: {
      orderNumber: `ORD-FIX-${seq[0].nextval}`,
      vendorId: opts.vendorId,
      customerId: opts.customerId,
      deliveryAddressText: opts.addressText ?? 'Fixture address, Beirut',
      deliveryCharge: charge,
      currency: opts.currency ?? 'LBP',
      status,
      ...(assigned && opts.driverId
        ? {
            driverId: opts.driverId,
            commissionBps: bps,
            platformCommissionAmount: commission,
            driverEarnings: charge - commission,
            assignedAt: now,
          }
        : {}),
      // order_ts_ordering: each timestamp implies the one before it.
      ...(status === 'PICKED_UP' || status === 'DELIVERED' || status === 'FAILED'
        ? { pickedUpAt: now }
        : {}),
      ...(status === 'DELIVERED'
        ? { deliveredAt: opts.deliveredAt === undefined ? now : opts.deliveredAt }
        : {}),
      ...(status === 'CANCELLED' ? { cancelledAt: now } : {}),
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    },
  });
}
