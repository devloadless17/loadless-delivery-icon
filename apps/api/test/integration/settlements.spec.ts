import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Currency, OrderStatus } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthService } from '../../src/auth/auth.service';
import { TokenService } from '../../src/auth/token.service';

/**
 * Daily driver settlement — the end-of-day cash handover.
 *
 * The driver collects the delivery fee at the door, keeps his earnings and owes
 * the platform its commission. These tests cover the ways that record can go
 * wrong with real money on the table: collecting twice, collecting against a
 * stale total, merging two currencies, losing a shortfall, and settling
 * deliveries that never actually took a fee from anybody.
 */
describe('driver settlements (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  let adminToken: string;
  let vendorId: string;
  let customerId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    server = app.getHttpServer();

    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE order_status_history, driver_settlement_lines,
       settlement_adjustments, driver_settlements, driver_balances, orders,
       customer_change_history, customer_vendors, customer_addresses, customers,
       audit_logs, refresh_tokens, file_objects, drivers, vendors, users CASCADE`,
    );
    await prisma.platformSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', defaultCommissionBps: 3000 },
      update: { defaultCommissionBps: 3000 },
    });

    const hash = await AuthService.hashPassword('password123');
    const adminUser = await prisma.user.create({
      data: { email: 'admin@settle.local', passwordHash: hash, role: 'ADMIN' },
    });
    adminToken = tokens.signAccessToken({ sub: adminUser.id, role: 'ADMIN', tv: 0 });

    const vendorUser = await prisma.user.create({
      data: { email: 'vendor@settle.local', passwordHash: hash, role: 'VENDOR' },
    });
    const vendor = await prisma.vendor.create({
      data: { userId: vendorUser.id, businessName: 'Settle Shop' },
    });
    vendorId = vendor.id;

    const customer = await prisma.customer.create({
      data: { normalizedPhone: '+96170999888', name: 'Settle Customer' },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ------------------------------------------------------------- fixtures

  let driverSeq = 0;

  async function makeDriver(name: string) {
    driverSeq += 1;
    const hash = await AuthService.hashPassword('password123');
    const phone = `+9617100${String(driverSeq).padStart(4, '0')}`;
    const user = await prisma.user.create({
      data: { normalizedPhone: phone, passwordHash: hash, role: 'DRIVER' },
    });
    const driver = await prisma.driver.create({
      data: { userId: user.id, fullName: name, contactPhone: phone, dutyStatus: 'ON_DUTY' },
    });
    const token = tokens.signAccessToken({
      sub: user.id,
      role: 'DRIVER',
      tv: 0,
      did: driver.id,
    });
    return { driver, token };
  }

  /**
   * A delivered order carrying its commission snapshot — the thing a settlement
   * collects against. `status` is overridable so the tests can prove that a
   * FAILED or admin-cancelled delivery is NEVER swept, even though both keep
   * the snapshot populated.
   */
  async function seedOrder(opts: {
    driverId: string;
    charge: bigint;
    currency: Currency;
    status?: OrderStatus;
    deliveredAt?: Date;
    /** Basis points for THIS delivery; defaults to the platform's 30%. */
    bps?: number;
  }) {
    const [{ nextval }] = await prisma.$queryRaw<[{ nextval: bigint }]>`
      SELECT nextval('order_number_seq')`;
    const bps = BigInt(opts.bps ?? 3000);
    const commission = (opts.charge * bps + 5000n) / 10000n;
    const status = opts.status ?? 'DELIVERED';
    return prisma.order.create({
      data: {
        orderNumber: `ORD-STL-${nextval}`,
        vendorId,
        customerId,
        driverId: opts.driverId,
        status,
        deliveryAddressText: 'Hamra, Beirut',
        deliveryCharge: opts.charge,
        currency: opts.currency,
        commissionBps: opts.bps ?? 3000,
        platformCommissionAmount: commission,
        driverEarnings: opts.charge - commission,
        assignedAt: new Date(),
        pickedUpAt: new Date(),
        deliveredAt: status === 'DELIVERED' ? (opts.deliveredAt ?? new Date()) : null,
        ...(status === 'CANCELLED' ? { cancelledAt: new Date(), cancellationReason: 'x' } : {}),
      },
    });
  }

  const previewOf = (driverId: string) =>
    request(server)
      .get(`/api/v1/admin/drivers/${driverId}/settlements/preview`)
      .set(auth(adminToken));

  interface PreviewLine {
    currency: Currency;
    orderCount: number;
    totalDue: string;
    commissionDue: string;
    broughtForward: string;
  }

  /** Settle exactly what the preview reported, paying `collect` per currency. */
  function settleBody(lines: PreviewLine[], collect: Record<string, string> = {}) {
    return {
      cutoffAt: new Date().toISOString(),
      expected: lines.map((l) => ({
        currency: l.currency,
        orderCount: l.orderCount,
        totalDue: l.totalDue,
      })),
      collections: lines
        .filter((l) => collect[l.currency] !== undefined)
        .map((l) => ({ currency: l.currency, amountCollected: collect[l.currency]! })),
    };
  }

  const lineFor = (body: { lines: Array<{ currency: string }> }, currency: string) =>
    body.lines.find((l) => l.currency === currency);

  // ------------------------------------------------------- the happy path

  it('settles a mixed LBP + USD day as two lines and never merges the currencies', async () => {
    const { driver } = await makeDriver('Mixed Currency Driver');
    await seedOrder({ driverId: driver.id, charge: 150_000n, currency: 'LBP' });
    await seedOrder({ driverId: driver.id, charge: 100_000n, currency: 'LBP' });
    await seedOrder({ driverId: driver.id, charge: 1250n, currency: 'USD' });

    const preview = await previewOf(driver.id).expect(200);
    const lines: PreviewLine[] = preview.body.data.lines;
    expect(lines).toHaveLength(2);

    // 30% of 250,000 LBP, and 30% of $12.50 = $3.75 -> 375 cents.
    expect(lineFor(preview.body.data, 'LBP')).toMatchObject({
      orderCount: 2,
      commissionDue: '75000',
      totalDue: '75000',
    });
    expect(lineFor(preview.body.data, 'USD')).toMatchObject({
      orderCount: 1,
      commissionDue: '375',
      totalDue: '375',
    });

    const res = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(lines, { LBP: '75000', USD: '3.75' }))
      .expect(201);

    expect(res.body.data.settlementNumber).toMatch(/^STL-\d{4}-\d{6}$/);
    expect(res.body.data.lines).toHaveLength(2);
    expect(lineFor(res.body.data, 'LBP')).toMatchObject({
      amountCollected: '75000',
      carriedForward: '0',
    });
    expect(lineFor(res.body.data, 'USD')).toMatchObject({
      amountCollected: '375',
      carriedForward: '0',
    });

    // Every order is stamped, so it can never be collected on again.
    const stamped = await prisma.order.count({
      where: { driverId: driver.id, settlementId: res.body.data.id },
    });
    expect(stamped).toBe(3);

    // And the driver is clear.
    const after = await previewOf(driver.id).expect(200);
    expect(after.body.data.lines).toHaveLength(0);
  });

  // ------------------------------------------- itemisation ("why this much?")

  it('itemises every delivery behind the figure, and the rows add up to it', async () => {
    // The dispute at the counter: the driver asks why he owes this. Both the
    // admin's preview and the driver's own phone must be able to answer, and
    // the itemised rows must reconcile exactly with the total being collected.
    const { driver, token } = await makeDriver('Itemised Driver');
    await prisma.driver.update({
      where: { id: driver.id },
      data: { commissionOverrideBps: 2500 }, // a negotiated rate, not the default
    });
    await seedOrder({ driverId: driver.id, charge: 150_000n, currency: 'LBP', bps: 2500 });
    await seedOrder({ driverId: driver.id, charge: 90_000n, currency: 'LBP', bps: 2500 });
    await seedOrder({ driverId: driver.id, charge: 2000n, currency: 'USD', bps: 2500 });

    const preview = await previewOf(driver.id).expect(200);
    const owed = await request(server)
      .get('/api/v1/driver/settlements/current')
      .set(auth(token))
      .expect(200);

    for (const [label, body] of [
      ['admin preview', preview.body.data],
      ['driver phone', owed.body.data],
    ] as const) {
      const orders: Array<{ currency: string; platformCommissionAmount: string; commissionBps: number }> =
        body.orders;
      expect(orders.length).toBe(3);

      // The rate travels with every row — without it a driver on 25% cannot
      // tell a correct figure from a wrong one.
      expect(orders.every((o) => o.commissionBps === 2500)).toBe(true);

      // Per currency, the itemised rows reconcile with the stated commission.
      for (const currency of ['LBP', 'USD'] as const) {
        const rows = orders.filter((o) => o.currency === currency);
        const summed = rows.reduce((t, o) => t + BigInt(o.platformCommissionAmount), 0n);
        const line = (body.lines as Array<Record<string, string>>).find(
          (l) => l.currency === currency,
        )!;
        // The admin preview names it commissionDue; the driver view names it
        // unsettledCommission. Same figure, two audiences.
        const statedRaw = line.commissionDue ?? line.unsettledCommission;
        expect(statedRaw).toBeDefined();
        const stated = BigInt(statedRaw!);
        expect(`${label} ${currency}: ${summed}`).toBe(`${label} ${currency}: ${stated}`);
      }
    }

    // 25% of 240,000 LBP and 25% of $20.00 — never added together.
    expect(lineFor(preview.body.data, 'LBP')).toMatchObject({ commissionDue: '60000' });
    expect(lineFor(preview.body.data, 'USD')).toMatchObject({ commissionDue: '500' });
  });

  it('gives the driver his own receipt for a past handover', async () => {
    const { driver, token } = await makeDriver('Receipt Reader');
    await seedOrder({ driverId: driver.id, charge: 100_000n, currency: 'LBP' });
    const preview = await previewOf(driver.id).expect(200);
    const settled = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(preview.body.data.lines, { LBP: '30000' }))
      .expect(201);

    const receipt = await request(server)
      .get(`/api/v1/driver/settlements/${settled.body.data.id}`)
      .set(auth(token))
      .expect(200);

    expect(receipt.body.data.orders).toHaveLength(1);
    expect(receipt.body.data.orders[0]).toMatchObject({
      commissionBps: 3000,
      platformCommissionAmount: '30000',
      deliveryCharge: '100000',
    });
  });

  // -------------------------------------------------- what may be settled

  it('never sweeps FAILED or cancelled orders, even though they keep the commission snapshot', async () => {
    const { driver } = await makeDriver('Snapshot Trap Driver');
    await seedOrder({ driverId: driver.id, charge: 100_000n, currency: 'LBP' });
    const failed = await seedOrder({
      driverId: driver.id,
      charge: 200_000n,
      currency: 'LBP',
      status: 'FAILED',
    });
    const cancelled = await seedOrder({
      driverId: driver.id,
      charge: 400_000n,
      currency: 'LBP',
      status: 'CANCELLED',
    });

    // Both really do still carry a populated snapshot — that is the trap.
    expect((await prisma.order.findUniqueOrThrow({ where: { id: failed.id } }))
      .platformCommissionAmount).toBe(60_000n);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: cancelled.id } }))
      .platformCommissionAmount).toBe(120_000n);

    const preview = await previewOf(driver.id).expect(200);
    // Only the one DELIVERED order: 30% of 100,000.
    expect(preview.body.data.lines).toHaveLength(1);
    expect(lineFor(preview.body.data, 'LBP')).toMatchObject({
      orderCount: 1,
      commissionDue: '30000',
    });
  });

  it('refuses at the database level to attach a non-delivered order to a settlement', async () => {
    const { driver } = await makeDriver('Direct Write Driver');
    await seedOrder({ driverId: driver.id, charge: 100_000n, currency: 'LBP' });
    const preview = await previewOf(driver.id).expect(200);
    const settled = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(preview.body.data.lines, { LBP: '30000' }))
      .expect(201);

    const failed = await seedOrder({
      driverId: driver.id,
      charge: 100_000n,
      currency: 'LBP',
      status: 'FAILED',
    });
    await expect(
      prisma.order.update({
        where: { id: failed.id },
        data: { settlementId: settled.body.data.id },
      }),
    ).rejects.toThrow(/order_settled_only_when_delivered/);
  });

  // ------------------------------------------------------ shortfall & carry

  it('carries a shortfall forward and shows it as brought-forward next time', async () => {
    const { driver, token } = await makeDriver('Short Payer');
    await seedOrder({ driverId: driver.id, charge: 150_000n, currency: 'LBP' });

    const first = await previewOf(driver.id).expect(200);
    expect(lineFor(first.body.data, 'LBP')).toMatchObject({ totalDue: '45000' });

    // Owes 45,000, hands over 30,000.
    const settled = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(first.body.data.lines, { LBP: '30000' }))
      .expect(201);
    expect(lineFor(settled.body.data, 'LBP')).toMatchObject({
      totalDue: '45000',
      amountCollected: '30000',
      carriedForward: '15000',
    });

    // The debt is on his balance, and he can see it himself.
    const owed = await request(server)
      .get('/api/v1/driver/settlements/current')
      .set(auth(token))
      .expect(200);
    expect(owed.body.data.clear).toBe(false);
    expect(lineFor(owed.body.data, 'LBP')).toMatchObject({
      unsettledCommission: '0',
      broughtForward: '15000',
      totalDue: '15000',
    });

    // Next day: one more order, and the old shortfall rides along.
    await seedOrder({ driverId: driver.id, charge: 100_000n, currency: 'LBP' });
    const second = await previewOf(driver.id).expect(200);
    expect(lineFor(second.body.data, 'LBP')).toMatchObject({
      orderCount: 1,
      commissionDue: '30000',
      broughtForward: '15000',
      totalDue: '45000',
    });

    const cleared = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(second.body.data.lines, { LBP: '45000' }))
      .expect(201);
    expect(lineFor(cleared.body.data, 'LBP')).toMatchObject({ carriedForward: '0' });

    const finalOwed = await request(server)
      .get('/api/v1/driver/settlements/current')
      .set(auth(token))
      .expect(200);
    expect(finalOwed.body.data.clear).toBe(true);
    expect(finalOwed.body.data.lines).toHaveLength(0);
  });

  it('keeps a debt in one currency visible on a day the driver only ran the other', async () => {
    const { driver } = await makeDriver('Two Currency Debtor');
    await seedOrder({ driverId: driver.id, charge: 1000n, currency: 'USD' });

    const first = await previewOf(driver.id).expect(200);
    await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(first.body.data.lines, { USD: '1.00' })) // owes 3.00, pays 1.00
      .expect(201);

    // Next day he only runs LBP work. The USD debt must NOT disappear.
    await seedOrder({ driverId: driver.id, charge: 100_000n, currency: 'LBP' });
    const second = await previewOf(driver.id).expect(200);
    expect(second.body.data.lines).toHaveLength(2);
    expect(lineFor(second.body.data, 'USD')).toMatchObject({
      orderCount: 0,
      broughtForward: '200',
      totalDue: '200',
    });

    const settled = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(second.body.data.lines, { LBP: '30000', USD: '2.00' }))
      .expect(201);
    expect(lineFor(settled.body.data, 'USD')).toMatchObject({ carriedForward: '0' });
    expect(lineFor(settled.body.data, 'LBP')).toMatchObject({ carriedForward: '0' });
  });

  // ---------------------------------------------------------- adjustments

  it('applies a charge and a credit, with the sign coming from the direction', async () => {
    const { driver } = await makeDriver('Adjusted Driver');
    await seedOrder({ driverId: driver.id, charge: 150_000n, currency: 'LBP' });
    const preview = await previewOf(driver.id).expect(200);

    const res = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send({
        ...settleBody(preview.body.data.lines),
        adjustments: [
          {
            currency: 'LBP',
            direction: 'DEBIT',
            amount: '5000',
            reason: 'Late to the pickup',
          },
          {
            currency: 'LBP',
            direction: 'CREDIT',
            amount: '10000',
            reason: 'Twenty deliveries this week',
          },
        ],
        collections: [{ currency: 'LBP', amountCollected: '40000' }],
      })
      .expect(201);

    // 45,000 commission + 5,000 fine - 10,000 bonus = 40,000 due, paid in full.
    expect(lineFor(res.body.data, 'LBP')).toMatchObject({
      commissionDue: '45000',
      adjustmentsTotal: '-5000',
      totalDue: '40000',
      amountCollected: '40000',
      carriedForward: '0',
    });
    expect(res.body.data.adjustments).toHaveLength(2);
  });

  it('rejects an adjustment with no amount or no reason', async () => {
    // There is no category to get wrong any more; what must not be skippable is
    // the sentence that explains the charge to the person paying it.
    const { driver } = await makeDriver('Bad Adjustment Driver');
    await seedOrder({ driverId: driver.id, charge: 150_000n, currency: 'LBP' });
    const preview = await previewOf(driver.id).expect(200);

    for (const bad of [
      { currency: 'LBP', direction: 'DEBIT', amount: '0', reason: 'Zero is not an adjustment' },
      { currency: 'LBP', direction: 'DEBIT', amount: '5000', reason: 'no' },
    ]) {
      const res = await request(server)
        .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
        .set(auth(adminToken))
        .send({ ...settleBody(preview.body.data.lines), adjustments: [bad] })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  // ---------------------------------------------------------- concurrency

  it('collects the same commission only once when two admins settle at the same moment', async () => {
    const { driver } = await makeDriver('Race Driver');
    await seedOrder({ driverId: driver.id, charge: 150_000n, currency: 'LBP' });
    const preview = await previewOf(driver.id).expect(200);
    const body = settleBody(preview.body.data.lines, { LBP: '45000' });

    const [a, b] = await Promise.all([
      request(server)
        .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
        .set(auth(adminToken))
        .send(body),
      request(server)
        .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
        .set(auth(adminToken))
        .send(body),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error.code).toBe('SETTLEMENT_TOTALS_CHANGED');

    // Exactly one settlement, and the driver is not owed twice.
    const count = await prisma.driverSettlement.count({ where: { driverId: driver.id } });
    expect(count).toBe(1);
    const balance = await prisma.driverBalance.findMany({ where: { driverId: driver.id } });
    expect(balance.map((r) => r.outstanding.toString())).toEqual(['0']);
  });

  it('refuses a settlement built on a stale preview', async () => {
    const { driver } = await makeDriver('Stale Preview Driver');
    await seedOrder({ driverId: driver.id, charge: 150_000n, currency: 'LBP' });
    const preview = await previewOf(driver.id).expect(200);

    // The driver delivers one more while the admin is still counting cash.
    await seedOrder({ driverId: driver.id, charge: 100_000n, currency: 'LBP' });

    const res = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(preview.body.data.lines, { LBP: '45000' }))
      .expect(409);
    expect(res.body.error.code).toBe('SETTLEMENT_TOTALS_CHANGED');
    // The fresh figure is handed back so the UI can re-confirm, not guess.
    expect(res.body.error.message).toContain('75,000 LBP');

    // Nothing was written.
    expect(await prisma.driverSettlement.count({ where: { driverId: driver.id } })).toBe(0);
    expect(await prisma.order.count({ where: { driverId: driver.id, settlementId: null } })).toBe(2);
  });

  it('refuses, in words, when there is genuinely nothing to settle', async () => {
    const { driver } = await makeDriver('Nothing Owed Driver');
    const res = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send({ cutoffAt: new Date().toISOString(), expected: [] })
      .expect(409);
    // A named refusal the UI can explain, not a shapeless validation error.
    expect(res.body.error.code).toBe('SETTLEMENT_NOTHING_TO_SETTLE');
  });

  it('records a fine against a driver who owes nothing', async () => {
    // An empty sweep is not an empty handover: a driver can be square on
    // commission and still be charged for something. This is why `expected`
    // is allowed to be empty.
    const { driver } = await makeDriver('Fined While Square');
    const preview = await previewOf(driver.id).expect(200);
    expect(preview.body.data.lines).toHaveLength(0);

    const res = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send({
        cutoffAt: new Date().toISOString(),
        expected: [],
        adjustments: [
          {
            currency: 'LBP',
            direction: 'DEBIT',
            amount: '5000',
            reason: 'Lost the thermal bag',
          },
        ],
        collections: [{ currency: 'LBP', amountCollected: '5000' }],
      })
      .expect(201);

    expect(lineFor(res.body.data, 'LBP')).toMatchObject({
      orderCount: 0,
      commissionDue: '0',
      adjustmentsTotal: '5000',
      totalDue: '5000',
      amountCollected: '5000',
      carriedForward: '0',
    });
  });

  it('will not let a delivered order exist without the moment it was delivered', async () => {
    // The sweep filters `delivered_at <= cutoff`, and no comparison against
    // NULL is ever true — so such a row would be invisible to every settlement
    // and its commission would never be collected by anyone.
    const { driver } = await makeDriver('Timeless Delivery Driver');
    await expect(
      seedOrder({ driverId: driver.id, charge: 100_000n, currency: 'LBP' }).then((order) =>
        prisma.order.update({ where: { id: order.id }, data: { deliveredAt: null } }),
      ),
    ).rejects.toThrow(/order_delivered_has_timestamp/);
  });

  // ----------------------------------------------------------------- void

  it('void releases the orders, restores the balance and keeps the record', async () => {
    const { driver } = await makeDriver('Voided Driver');
    await seedOrder({ driverId: driver.id, charge: 150_000n, currency: 'LBP' });
    const first = await previewOf(driver.id).expect(200);
    const settled = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(first.body.data.lines, { LBP: '20000' })) // short by 25,000
      .expect(201);
    const settlementId = settled.body.data.id;

    expect(
      (await prisma.driverBalance.findFirstOrThrow({
        where: { driverId: driver.id, currency: 'LBP' },
      })).outstanding,
    ).toBe(25_000n);

    const voided = await request(server)
      .post(`/api/v1/admin/settlements/${settlementId}/void`)
      .set(auth(adminToken))
      .send({ reason: 'Counted the cash wrong' })
      .expect(201);

    expect(voided.body.data.status).toBe('VOIDED');
    expect(voided.body.data.voidReason).toBe('Counted the cash wrong');
    // The lines survive — the record of what was recorded is not erased.
    expect(voided.body.data.lines).toHaveLength(1);

    // The order is collectable again, and the debt is gone.
    expect(await prisma.order.count({ where: { driverId: driver.id, settlementId: null } })).toBe(1);
    expect(
      (await prisma.driverBalance.findFirstOrThrow({
        where: { driverId: driver.id, currency: 'LBP' },
      })).outstanding,
    ).toBe(0n);

    const preview = await previewOf(driver.id).expect(200);
    expect(lineFor(preview.body.data, 'LBP')).toMatchObject({ orderCount: 1, totalDue: '45000' });
  });

  it('refuses to void twice, and refuses to void anything but the latest', async () => {
    const { driver } = await makeDriver('Chain Void Driver');
    await seedOrder({ driverId: driver.id, charge: 100_000n, currency: 'LBP' });
    const p1 = await previewOf(driver.id).expect(200);
    const first = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(p1.body.data.lines, { LBP: '30000' }))
      .expect(201);

    await seedOrder({ driverId: driver.id, charge: 100_000n, currency: 'LBP' });
    const p2 = await previewOf(driver.id).expect(200);
    const second = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(p2.body.data.lines, { LBP: '30000' }))
      .expect(201);

    // The older one cannot be voided while a later one stands on its balance.
    const outOfOrder = await request(server)
      .post(`/api/v1/admin/settlements/${first.body.data.id}/void`)
      .set(auth(adminToken))
      .send({ reason: 'Trying to unwind the wrong end' })
      .expect(409);
    expect(outOfOrder.body.error.code).toBe('SETTLEMENT_NOT_LATEST');

    // Unwind from the end, then the older one becomes voidable.
    await request(server)
      .post(`/api/v1/admin/settlements/${second.body.data.id}/void`)
      .set(auth(adminToken))
      .send({ reason: 'Unwinding properly' })
      .expect(201);

    const twice = await request(server)
      .post(`/api/v1/admin/settlements/${second.body.data.id}/void`)
      .set(auth(adminToken))
      .send({ reason: 'Again' })
      .expect(409);
    expect(twice.body.error.code).toBe('SETTLEMENT_ALREADY_VOIDED');

    await request(server)
      .post(`/api/v1/admin/settlements/${first.body.data.id}/void`)
      .set(auth(adminToken))
      .send({ reason: 'Now in order' })
      .expect(201);

    // Everything is back to unsettled and no debt remains.
    expect(await prisma.order.count({ where: { driverId: driver.id, settlementId: null } })).toBe(2);
    const balances = await prisma.driverBalance.findMany({ where: { driverId: driver.id } });
    expect(balances.every((b) => b.outstanding === 0n)).toBe(true);
  });

  // -------------------------------------------------------- reconciliation

  it('keeps the materialised balance equal to the settlement chain', async () => {
    const { driver } = await makeDriver('Reconciled Driver');
    // Four rounds of settle-a-bit-short, then a void of the last one.
    const collected = ['10000', '5000', '20000', '1000'];
    for (const amount of collected) {
      await seedOrder({ driverId: driver.id, charge: 100_000n, currency: 'LBP' });
      const preview = await previewOf(driver.id).expect(200);
      await request(server)
        .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
        .set(auth(adminToken))
        .send(settleBody(preview.body.data.lines, { LBP: amount }))
        .expect(201);
    }

    // Derive the truth independently: the latest non-voided settlement's
    // carried-forward IS the outstanding balance.
    const derive = async () => {
      const latest = await prisma.driverSettlement.findFirst({
        where: { driverId: driver.id, status: 'SETTLED' },
        orderBy: [{ settledAt: 'desc' }, { id: 'desc' }],
        select: { lines: { where: { currency: 'LBP' }, select: { carriedForward: true } } },
      });
      return latest?.lines[0]?.carriedForward ?? 0n;
    };
    const stored = async () =>
      (
        await prisma.driverBalance.findUniqueOrThrow({
          where: { driverId_currency: { driverId: driver.id, currency: 'LBP' } },
        })
      ).outstanding;

    expect(await stored()).toBe(await derive());
    // 4 x 30,000 due, 36,000 paid in total.
    expect(await stored()).toBe(84_000n);

    const latest = await prisma.driverSettlement.findFirstOrThrow({
      where: { driverId: driver.id, status: 'SETTLED' },
      orderBy: [{ settledAt: 'desc' }, { id: 'desc' }],
    });
    await request(server)
      .post(`/api/v1/admin/settlements/${latest.id}/void`)
      .set(auth(adminToken))
      .send({ reason: 'Reconciliation check' })
      .expect(201);

    expect(await stored()).toBe(await derive());
  });

  // ------------------------------------------------------------ the worklist

  it('lists only drivers who actually owe something', async () => {
    const { driver: owing } = await makeDriver('Owes Money');
    await seedOrder({ driverId: owing.id, charge: 150_000n, currency: 'LBP' });
    const { driver: clear } = await makeDriver('Owes Nothing');

    const res = await request(server)
      .get('/api/v1/admin/settlements/outstanding')
      .set(auth(adminToken))
      .expect(200);

    const ids = res.body.data.map((row: { driverId: string }) => row.driverId);
    expect(ids).toContain(owing.id);
    expect(ids).not.toContain(clear.id);

    const row = res.body.data.find((r: { driverId: string }) => r.driverId === owing.id);
    expect(row.lines).toEqual([
      {
        currency: 'LBP',
        unsettledCommission: '45000',
        unsettledOrderCount: 1,
        broughtForward: '0',
        totalDue: '45000',
      },
    ]);
  });

  // ---------------------------------------------------------- authorization

  it('hides one driver’s receipt from another', async () => {
    const { driver: owner } = await makeDriver('Receipt Owner');
    const { token: stranger } = await makeDriver('Nosy Driver');
    await seedOrder({ driverId: owner.id, charge: 100_000n, currency: 'LBP' });
    const preview = await previewOf(owner.id).expect(200);
    const settled = await request(server)
      .post(`/api/v1/admin/drivers/${owner.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(preview.body.data.lines, { LBP: '30000' }))
      .expect(201);

    // A 404, not a 403 — confirming it exists would leak who settled what.
    const res = await request(server)
      .get(`/api/v1/driver/settlements/${settled.body.data.id}`)
      .set(auth(stranger))
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('refuses a driver and a vendor at the admin settlement routes', async () => {
    const { driver, token: driverToken } = await makeDriver('Not An Admin');
    await request(server)
      .get('/api/v1/admin/settlements/outstanding')
      .set(auth(driverToken))
      .expect(403);
    await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(driverToken))
      .send({ cutoffAt: new Date().toISOString(), expected: [] })
      .expect(403);
  });

  // ------------------------------------------------------ the driver in credit

  it('a driver who overpaid goes into credit, and can still be settled', async () => {
    // Found by Ali using it: an overpayment leaves a NEGATIVE balance, and the
    // settle screen defaulted its cash box to that negative. "-10000" is not a
    // parseable amount, so the confirm button stayed disabled and the driver
    // became impossible to settle at all. Nobody hands over a negative amount
    // of cash; the API side of that is asserted here.
    const { driver, token } = await makeDriver('Overpaid Driver');
    await seedOrder({ driverId: driver.id, charge: 100_000n, currency: 'LBP' });

    const first = await previewOf(driver.id).expect(200);
    const overpaid = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(first.body.data.lines, { LBP: '40000' })) // owes 30,000
      .expect(201);
    expect(lineFor(overpaid.body.data, 'LBP')).toMatchObject({
      totalDue: '30000',
      amountCollected: '40000',
      carriedForward: '-10000', // the platform owes him 10,000
    });

    // The balance is negative, and both audiences report it as credit rather
    // than as a debt with a minus sign in front of it.
    const balance = await prisma.driverBalance.findUniqueOrThrow({
      where: { driverId_currency: { driverId: driver.id, currency: 'LBP' } },
    });
    expect(balance.outstanding).toBe(-10_000n);

    const owed = await request(server)
      .get('/api/v1/driver/settlements/current')
      .set(auth(token))
      .expect(200);
    expect(lineFor(owed.body.data, 'LBP')).toMatchObject({ totalDue: '-10000' });

    // He can still be settled: collecting nothing is valid, and the credit
    // simply carries on.
    const second = await previewOf(driver.id).expect(200);
    expect(lineFor(second.body.data, 'LBP')).toMatchObject({ totalDue: '-10000' });

    const carried = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(second.body.data.lines, { LBP: '0' }))
      .expect(201);
    expect(lineFor(carried.body.data, 'LBP')).toMatchObject({
      amountCollected: '0',
      carriedForward: '-10000',
    });

    // Or the credit can be spent against a charge, landing him back at square.
    const third = await previewOf(driver.id).expect(200);
    const cleared = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send({
        ...settleBody(third.body.data.lines),
        adjustments: [
          { currency: 'LBP', direction: 'DEBIT', amount: '10000', reason: 'Lost the thermal bag' },
        ],
        collections: [{ currency: 'LBP', amountCollected: '0' }],
      })
      .expect(201);
    expect(lineFor(cleared.body.data, 'LBP')).toMatchObject({
      broughtForward: '-10000',
      adjustmentsTotal: '10000',
      totalDue: '0',
      carriedForward: '0',
    });

    const finalOwed = await request(server)
      .get('/api/v1/driver/settlements/current')
      .set(auth(token))
      .expect(200);
    expect(finalOwed.body.data.clear).toBe(true);
  });

  it('keeps a driver in credit on the worklist, as a negative rather than a debt', async () => {
    // The admin still has to see him — an open balance in either direction has
    // to be settled eventually — but the sign is what tells the UI to render
    // "in credit" instead of listing him as owing money he does not owe.
    const { driver } = await makeDriver('Credit On Worklist');
    await seedOrder({ driverId: driver.id, charge: 100_000n, currency: 'LBP' });
    const preview = await previewOf(driver.id).expect(200);
    await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(preview.body.data.lines, { LBP: '50000' })) // owes 30,000
      .expect(201);

    const res = await request(server)
      .get('/api/v1/admin/settlements/outstanding')
      .set(auth(adminToken))
      .expect(200);

    const row = res.body.data.find((r: { driverId: string }) => r.driverId === driver.id);
    expect(row).toBeDefined();
    expect(row.lines).toEqual([
      {
        currency: 'LBP',
        unsettledCommission: '0',
        unsettledOrderCount: 0,
        broughtForward: '-20000',
        totalDue: '-20000',
      },
    ]);
  });

  // ------------------------------------------------------- deleting a driver

  it('refuses to delete a driver who has settlements but no orders', async () => {
    // The gap this closes is narrow but real, and now reachable: an
    // adjustment-only settlement needs no deliveries at all, so a driver CAN
    // hold a record of cash that changed hands while having zero orders. The
    // orders guard alone would let him be deleted, taking that record with him.
    const { driver } = await makeDriver('Fined But Orderless');
    await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send({
        cutoffAt: new Date().toISOString(),
        expected: [],
        adjustments: [
          { currency: 'LBP', direction: 'DEBIT', amount: '5000', reason: 'Lost the thermal bag' },
        ],
        collections: [{ currency: 'LBP', amountCollected: '5000' }],
      })
      .expect(201);

    expect(await prisma.order.count({ where: { driverId: driver.id } })).toBe(0);

    const res = await request(server)
      .delete(`/api/v1/admin/drivers/${driver.id}`)
      .set(auth(adminToken))
      .expect(409);
    expect(res.body.error.code).toBe('DRIVER_HAS_SETTLEMENTS');

    // And he is still there, with his record.
    expect(await prisma.driver.count({ where: { id: driver.id } })).toBe(1);
  });

  // ------------------------------------------------------------ immutability

  it('refuses to mutate or delete a recorded settlement', async () => {
    const { driver } = await makeDriver('Immutable Driver');
    await seedOrder({ driverId: driver.id, charge: 100_000n, currency: 'LBP' });
    const preview = await previewOf(driver.id).expect(200);
    const settled = await request(server)
      .post(`/api/v1/admin/drivers/${driver.id}/settlements`)
      .set(auth(adminToken))
      .send(settleBody(preview.body.data.lines, { LBP: '30000' }))
      .expect(201);

    await expect(
      prisma.driverSettlementLine.updateMany({
        where: { settlementId: settled.body.data.id },
        data: { amountCollected: 999n },
      }),
    ).rejects.toThrow(/append-only/);

    await expect(
      prisma.driverSettlement.delete({ where: { id: settled.body.data.id } }),
    ).rejects.toThrow(/never deleted/);
  });
});
