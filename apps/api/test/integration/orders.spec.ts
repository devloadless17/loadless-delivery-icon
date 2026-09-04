import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthService } from '../../src/auth/auth.service';
import { TokenService } from '../../src/auth/token.service';

/**
 * The concurrency + authorization suite the plan calls non-negotiable:
 * every guarantee here is one the UI cannot provide.
 */
describe('orders (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  // seeded actors
  let vendorAToken: string;
  let vendorBToken: string;
  let driverAToken: string; // 20% override
  let driverBToken: string; // platform default 30%
  let adminToken: string;
  let driverAId: string;
  let driverBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
    server = app.getHttpServer();

    // clean slate — TRUNCATE bypasses the append-only row trigger on history
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

    // Identity split by role: admins/vendors use email, drivers use phone.
    const mkEmail = async (email: string, role: 'ADMIN' | 'VENDOR') =>
      prisma.user.create({ data: { email, passwordHash: hash, role } });
    const mkPhone = async (phone: string) =>
      prisma.user.create({ data: { normalizedPhone: phone, passwordHash: hash, role: 'DRIVER' } });

    const adminUser = await mkEmail('admin@test.local', 'ADMIN');
    const vendorAUser = await mkEmail('vendor-a@test.local', 'VENDOR');
    const vendorBUser = await mkEmail('vendor-b@test.local', 'VENDOR');
    const driverAUser = await mkPhone('+96171000001');
    const driverBUser = await mkPhone('+96171000002');

    const vendorA = await prisma.vendor.create({
      data: { userId: vendorAUser.id, businessName: 'Vendor A' },
    });
    const vendorB = await prisma.vendor.create({
      data: { userId: vendorBUser.id, businessName: 'Vendor B' },
    });
    const driverA = await prisma.driver.create({
      data: {
        userId: driverAUser.id,
        fullName: 'Driver A',
        contactPhone: '+96171000001',
        dutyStatus: 'ON_DUTY',
        commissionOverrideBps: 2000, // 20%
      },
    });
    const driverB = await prisma.driver.create({
      data: {
        userId: driverBUser.id,
        fullName: 'Driver B',
        contactPhone: '+96171000002',
        dutyStatus: 'ON_DUTY',
        commissionOverrideBps: null, // platform default 30%
      },
    });

    driverAId = driverA.id;
    driverBId = driverB.id;

    adminToken = tokens.signAccessToken({ sub: adminUser.id, role: 'ADMIN', tv: 0 });
    vendorAToken = tokens.signAccessToken({ sub: vendorAUser.id, role: 'VENDOR', tv: 0, vid: vendorA.id });
    vendorBToken = tokens.signAccessToken({ sub: vendorBUser.id, role: 'VENDOR', tv: 0, vid: vendorB.id });
    driverAToken = tokens.signAccessToken({ sub: driverAUser.id, role: 'DRIVER', tv: 0, did: driverA.id });
    driverBToken = tokens.signAccessToken({ sub: driverBUser.id, role: 'DRIVER', tv: 0, did: driverB.id });
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createOrder(charge = '100000'): Promise<string> {
    const res = await request(server)
      .post('/api/v1/vendor/orders')
      .set(auth(vendorAToken))
      .send({
        customerPhone: '03 987 654',
        customerName: 'Test Customer',
        deliveryAddressText: 'Hamra, Beirut',
        deliveryCharge: charge,
        currency: 'LBP',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    return res.body.data.id as string;
  }

  it('creates an order with a PENDING snapshot and no financial split', async () => {
    const id = await createOrder('150000');
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order.deliveryCharge).toBe(150000n);
    expect(order.commissionBps).toBeNull();
    expect(order.platformCommissionAmount).toBeNull();
    expect(order.driverEarnings).toBeNull();
    expect(order.orderNumber).toMatch(/^ORD-\d{4}-\d{6}$/);
  });

  it('THE RACE: two drivers accept simultaneously — exactly one wins', async () => {
    const id = await createOrder('100000');

    const [r1, r2] = await Promise.all([
      request(server).post(`/api/v1/driver/orders/${id}/accept`).set(auth(driverAToken)),
      request(server).post(`/api/v1/driver/orders/${id}/accept`).set(auth(driverBToken)),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    expect(loser.body.error.code).toBe('ORDER_NO_LONGER_AVAILABLE');

    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order.status).toBe('DRIVER_ASSIGNED');
    expect(order.driverId).not.toBeNull();

    // Financial snapshot matches the WINNER's personal rate exactly.
    if (order.driverId === driverAId) {
      expect(order.commissionBps).toBe(2000);
      expect(order.platformCommissionAmount).toBe(20000n);
      expect(order.driverEarnings).toBe(80000n);
    } else {
      expect(order.driverId).toBe(driverBId);
      expect(order.commissionBps).toBe(3000);
      expect(order.platformCommissionAmount).toBe(30000n);
      expect(order.driverEarnings).toBe(70000n);
    }
    expect(
      (order.platformCommissionAmount as bigint) + (order.driverEarnings as bigint),
    ).toBe(order.deliveryCharge);

    // Exactly one assignment history row.
    const historyRows = await prisma.orderStatusHistory.count({
      where: { orderId: id, toStatus: 'DRIVER_ASSIGNED' },
    });
    expect(historyRows).toBe(1);
  });

  it('THE RACE: vendor cancel vs driver accept — one consistent outcome', async () => {
    // Run several rounds to exercise both interleavings.
    for (let round = 0; round < 5; round++) {
      const id = await createOrder();
      const [cancelRes, acceptRes] = await Promise.all([
        request(server)
          .post(`/api/v1/vendor/orders/${id}/cancel`)
          .set(auth(vendorAToken))
          .send({ reason: 'Customer changed their mind' }),
        request(server).post(`/api/v1/driver/orders/${id}/accept`).set(auth(driverAToken)),
      ]);

      const order = await prisma.order.findUniqueOrThrow({ where: { id } });
      if (cancelRes.status === 200) {
        expect(acceptRes.status).toBe(409);
        expect(order.status).toBe('CANCELLED');
        expect(order.driverId).toBeNull();
      } else {
        expect(cancelRes.status).toBe(409);
        expect(acceptRes.status).toBe(200);
        expect(order.status).toBe('DRIVER_ASSIGNED');
        expect(order.driverId).toBe(driverAId);
      }
    }
  });

  it('vendor cannot cancel after driver acceptance', async () => {
    const id = await createOrder();
    await request(server).post(`/api/v1/driver/orders/${id}/accept`).set(auth(driverAToken)).expect(200);

    const res = await request(server)
      .post(`/api/v1/vendor/orders/${id}/cancel`)
      .set(auth(vendorAToken))
      .send({ reason: 'Trying to cancel too late' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('pickup/deliver are idempotent on double-tap and reject skips', async () => {
    const id = await createOrder();
    await request(server).post(`/api/v1/driver/orders/${id}/accept`).set(auth(driverAToken)).expect(200);

    // deliver before pickup → 409
    const skip = await request(server).post(`/api/v1/driver/orders/${id}/deliver`).set(auth(driverAToken));
    expect(skip.status).toBe(409);

    // double-tap pickup → both succeed, single history row
    const [p1, p2] = await Promise.all([
      request(server).post(`/api/v1/driver/orders/${id}/pickup`).set(auth(driverAToken)),
      request(server).post(`/api/v1/driver/orders/${id}/pickup`).set(auth(driverAToken)),
    ]);
    expect([p1.status, p2.status]).toEqual([200, 200]);
    const pickupRows = await prisma.orderStatusHistory.count({
      where: { orderId: id, toStatus: 'PICKED_UP' },
    });
    expect(pickupRows).toBe(1);

    await request(server).post(`/api/v1/driver/orders/${id}/deliver`).set(auth(driverAToken)).expect(200);
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order.status).toBe('DELIVERED');
    expect(order.deliveredAt).not.toBeNull();
  });

  it('release returns the order to PENDING with a cleared snapshot; next accept recomputes', async () => {
    const id = await createOrder('100000');
    await request(server).post(`/api/v1/driver/orders/${id}/accept`).set(auth(driverAToken)).expect(200);

    await request(server)
      .post(`/api/v1/driver/orders/${id}/release`)
      .set(auth(driverAToken))
      .send({ reason: 'Bike broke down' })
      .expect(200);

    let order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order.status).toBe('PENDING');
    expect(order.driverId).toBeNull();
    expect(order.commissionBps).toBeNull();

    // Driver B (30%) accepts — snapshot uses B's rate, not A's.
    await request(server).post(`/api/v1/driver/orders/${id}/accept`).set(auth(driverBToken)).expect(200);
    order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order.commissionBps).toBe(3000);
    expect(order.driverEarnings).toBe(70000n);
  });

  it('release is not possible after pickup', async () => {
    const id = await createOrder();
    await request(server).post(`/api/v1/driver/orders/${id}/accept`).set(auth(driverAToken)).expect(200);
    await request(server).post(`/api/v1/driver/orders/${id}/pickup`).set(auth(driverAToken)).expect(200);
    const res = await request(server)
      .post(`/api/v1/driver/orders/${id}/release`)
      .set(auth(driverAToken))
      .send({ reason: 'Too late to release' });
    expect(res.status).toBe(409);
  });

  it('IDOR: a vendor cannot read or cancel another vendor\'s order', async () => {
    const id = await createOrder();
    await request(server).get(`/api/v1/vendor/orders/${id}`).set(auth(vendorBToken)).expect(404);
    const res = await request(server)
      .post(`/api/v1/vendor/orders/${id}/cancel`)
      .set(auth(vendorBToken))
      .send({ reason: 'Not my order but trying anyway' });
    expect(res.status).toBe(404);
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order.status).toBe('PENDING'); // untouched
  });

  it('IDOR: a driver cannot act on another driver\'s order', async () => {
    const id = await createOrder();
    await request(server).post(`/api/v1/driver/orders/${id}/accept`).set(auth(driverAToken)).expect(200);
    await request(server).post(`/api/v1/driver/orders/${id}/pickup`).set(auth(driverBToken)).expect(404);
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order.status).toBe('DRIVER_ASSIGNED');
  });

  it('off-duty drivers cannot accept', async () => {
    await prisma.driver.update({ where: { id: driverBId }, data: { dutyStatus: 'OFF_DUTY' } });
    const id = await createOrder();
    const res = await request(server).post(`/api/v1/driver/orders/${id}/accept`).set(auth(driverBToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('DRIVER_NOT_AVAILABLE');
    await prisma.driver.update({ where: { id: driverBId }, data: { dutyStatus: 'ON_DUTY' } });
  });

  it('admin reassignment swaps the driver and recomputes the snapshot', async () => {
    const id = await createOrder('100000');
    await request(server).post(`/api/v1/driver/orders/${id}/accept`).set(auth(driverAToken)).expect(200);

    await request(server)
      .post(`/api/v1/admin/orders/${id}/reassign`)
      .set(auth(adminToken))
      .send({ driverId: driverBId, reason: 'Driver A unavailable' })
      .expect(200);

    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order.driverId).toBe(driverBId);
    expect(order.status).toBe('DRIVER_ASSIGNED');
    expect(order.commissionBps).toBe(3000); // B's rate, not A's 2000
    expect(order.pickedUpAt).toBeNull();
  });

  it('vendor responses never leak the commission split', async () => {
    const id = await createOrder();
    await request(server).post(`/api/v1/driver/orders/${id}/accept`).set(auth(driverAToken)).expect(200);
    const res = await request(server).get(`/api/v1/vendor/orders/${id}`).set(auth(vendorAToken)).expect(200);
    expect(res.body.data.platformCommissionAmount).toBeUndefined();
    expect(res.body.data.driverEarnings).toBeUndefined();
    expect(res.body.data.commissionBps).toBeUndefined();
    expect(res.body.data.deliveryCharge).toBe('100000'); // BigInt serialized as string
  });

  it('shared customer is reused across vendors at order creation', async () => {
    await request(server)
      .post('/api/v1/vendor/orders')
      .set(auth(vendorBToken))
      .send({
        customerPhone: '03987654', // same customer as vendor A's orders, different format
        deliveryAddressText: 'Verdun, Beirut',
        deliveryCharge: '80000',
        currency: 'LBP',
      })
      .expect(201);

    const count = await prisma.customer.count({ where: { normalizedPhone: '+9613987654' } });
    expect(count).toBe(1);
  });
  // ---------------------------------------------------------------- driver photos

  /**
   * The face photo exists for one job: the vendor checking that the person at
   * their counter is the driver they were assigned. Showing it to them widens
   * a file-access rule, so the boundary is asserted in both directions — and
   * the BIKE photo stays with the platform.
   */
  describe('driver photos: the face reaches the vendor handing over, the bike does not', () => {
    let facePhotoKey: string;
    let bikePhotoKey: string;

    beforeAll(async () => {
      // Uploaded by the ADMIN filling in the driver form, which is exactly why
      // the file's ownerUserId cannot answer "whose photo is this?" — the keys
      // on the driver row are the only honest link.
      const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
      const mk = async (purpose: 'DRIVER_FACE' | 'DRIVER_BIKE', name: string) => {
        const key = `${purpose.toLowerCase()}/${name}.jpg`;
        const full = path.join('/tmp/loadless-itest-uploads', key);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, Buffer.from([0xff, 0xd8, 0xff, 0xd9])); // tiny jpeg
        await prisma.fileObject.create({
          data: { key, purpose, ownerUserId: admin.id, contentType: 'image/jpeg', sizeBytes: 4 },
        });
        return key;
      };
      facePhotoKey = await mk('DRIVER_FACE', 'aaaaface');
      bikePhotoKey = await mk('DRIVER_BIKE', 'aaaabike');
      await prisma.driver.update({
        where: { id: driverAId },
        data: { facePhotoKey, bikePhotoKey },
      });
    });

    it('the face key ships on the vendor order once a driver accepts — never the bike', async () => {
      const created = await request(server)
        .post('/api/v1/vendor/orders')
        .set(auth(vendorAToken))
        .send({
          customerPhone: '03700111',
          customerName: 'Handover Customer',
          deliveryAddressText: 'Somewhere, Bldg 1',
          deliveryCharge: '100000',
          currency: 'LBP',
        })
        .expect(201);
      const id = created.body.data.id;

      // PENDING: no driver yet, so nothing to show.
      const before = await request(server)
        .get(`/api/v1/vendor/orders/${id}`)
        .set(auth(vendorAToken))
        .expect(200);
      expect(before.body.data.driver).toBeNull();

      await request(server)
        .post(`/api/v1/driver/orders/${id}/accept`)
        .set(auth(driverAToken))
        .expect(200);

      const after = await request(server)
        .get(`/api/v1/vendor/orders/${id}`)
        .set(auth(vendorAToken))
        .expect(200);
      expect(after.body.data.driver.facePhotoKey).toBe(facePhotoKey);
      expect(after.body.data.driver.bikePhotoKey).toBeUndefined();
      expect(JSON.stringify(after.body)).not.toContain('driver_bike');

      // The face file loads for that vendor; the bike does not exist for them.
      await request(server)
        .get(`/api/v1/files/${facePhotoKey}`)
        .set(auth(vendorAToken))
        .expect(200);
      await request(server)
        .get(`/api/v1/files/${bikePhotoKey}`)
        .set(auth(vendorAToken))
        .expect(404);
    });

    it('a vendor this driver never carried for gets 404 — not 403', async () => {
      // 404 and not 403: a refusal that confirms the file exists is itself a
      // small statement about who drives for whom.
      for (const key of [facePhotoKey, bikePhotoKey]) {
        await request(server).get(`/api/v1/files/${key}`).set(auth(vendorBToken)).expect(404);
      }
    });

    it('a driver can see their OWN face on their own profile payload', async () => {
      // The platform uploads it and the driver never does, which is exactly
      // why /me has to carry the key: otherwise the person in the photo is the
      // only one in the system who cannot see it.
      const me = await request(server)
        .get('/api/v1/auth/me')
        .set(auth(driverAToken))
        .expect(200);
      expect(me.body.data.user.driver.facePhotoKey).toBe(facePhotoKey);
      // …and the bike stays with the platform, even for them here.
      expect(me.body.data.user.driver.bikePhotoKey).toBeUndefined();
    });

    it('the driver sees both of their own; admin sees both of anyone\'s', async () => {
      for (const token of [driverAToken, adminToken]) {
        await request(server).get(`/api/v1/files/${facePhotoKey}`).set(auth(token)).expect(200);
        await request(server).get(`/api/v1/files/${bikePhotoKey}`).set(auth(token)).expect(200);
      }
    });
  });

  describe('a suspended driver never ends up holding an order', () => {
    /**
     * The precondition check and the write have to agree.
     *
     * `accept` reads the driver's status before opening its transaction, and
     * the guarded updateMany only guards the ORDER row. Without a re-check
     * inside the transaction, a suspension landing in that window leaves the
     * order DRIVER_ASSIGNED to a SUSPENDED driver, carrying a real commission
     * snapshot computed at his rate.
     *
     * Firing the two with Promise.all does NOT reproduce it — the window is
     * narrower than the scheduling jitter, and such a test passes just as
     * happily with the fix removed, which is worth knowing before trusting one.
     * So the interleaving is forced: a transaction takes the driver's row
     * lock, the accept is started and parks on that same lock, and only then
     * does the holder suspend him and commit. The accept therefore does its
     * OUTSIDE-the-transaction pre-check while he still reads ACTIVE, and
     * commits after he is suspended — exactly the ordering the bug needs.
     */
    afterEach(async () => {
      await prisma.driver.update({
        where: { id: driverBId },
        data: { status: 'ACTIVE', dutyStatus: 'ON_DUTY' },
      });
    });

    it('refuses an accept that commits after the driver was suspended', async () => {
      const orderId = await createOrder();

      const holder = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "status" FROM "drivers" WHERE "id" = ${driverBId} FOR UPDATE`;
          // Long enough for the accept below to run its pre-check and reach
          // the lock while this transaction still holds it.
          await new Promise((resolve) => setTimeout(resolve, 1200));
          await tx.$executeRaw`UPDATE "drivers" SET "status" = 'SUSPENDED' WHERE "id" = ${driverBId}`;
        },
        { timeout: 20_000, maxWait: 20_000 },
      );

      await new Promise((resolve) => setTimeout(resolve, 300));
      const acceptPromise = request(server)
        .post(`/api/v1/driver/orders/${orderId}/accept`)
        .set(auth(driverBToken));

      const [, acceptRes] = await Promise.all([holder, acceptPromise]);

      expect(acceptRes.status).toBe(403);
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true, driverId: true, platformCommissionAmount: true },
      });
      expect(order?.status).toBe('PENDING');
      expect(order?.driverId).toBeNull();
      // And no financial snapshot was left behind on the way out.
      expect(order?.platformCommissionAmount).toBeNull();
    });

    it('refuses a reassign that commits after the new driver was suspended', async () => {
      const orderId = await createOrder();
      await request(server)
        .post(`/api/v1/driver/orders/${orderId}/accept`)
        .set(auth(driverAToken))
        .expect(200);

      const holder = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT "status" FROM "drivers" WHERE "id" = ${driverBId} FOR UPDATE`;
          await new Promise((resolve) => setTimeout(resolve, 1200));
          await tx.$executeRaw`UPDATE "drivers" SET "status" = 'SUSPENDED' WHERE "id" = ${driverBId}`;
        },
        { timeout: 20_000, maxWait: 20_000 },
      );

      await new Promise((resolve) => setTimeout(resolve, 300));
      const reassignPromise = request(server)
        .post(`/api/v1/admin/orders/${orderId}/reassign`)
        .set(auth(adminToken))
        .send({ driverId: driverBId, reason: 'racing a suspension' });

      const [, reassignRes] = await Promise.all([holder, reassignPromise]);

      expect(reassignRes.status).toBe(403);
      // The original driver keeps it; nothing is left half-swapped.
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { driverId: true },
      });
      expect(order?.driverId).toBe(driverAId);
    });
  });
});
