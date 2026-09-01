import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthService } from '../../src/auth/auth.service';
import { TokenService } from '../../src/auth/token.service';

/**
 * Admin deletions of vendors, drivers and customers. The rule under test is an
 * ACCOUNTING one, not a permission one: an admin may remove a record typed in
 * by mistake, but not one that appears on an order — those carry the commission
 * the platform charged and the earnings a driver is owed. Suspension is the
 * operation for anyone who has actually traded.
 */
describe('admin deletions (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  let adminToken: string;
  let vendorToken: string;
  let driverToken: string;
  let driverId: string;

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
      data: { email: 'admin@vend.local', passwordHash: hash, role: 'ADMIN' },
    });
    const bystanderUser = await prisma.user.create({
      data: { email: 'bystander@vend.local', passwordHash: hash, role: 'VENDOR' },
    });
    const bystander = await prisma.vendor.create({
      data: { userId: bystanderUser.id, businessName: 'Bystander Shop' },
    });
    const driverUser = await prisma.user.create({
      data: { normalizedPhone: '+96171555222', passwordHash: hash, role: 'DRIVER' },
    });
    const driver = await prisma.driver.create({
      data: {
        userId: driverUser.id,
        fullName: 'Delete Test Driver',
        contactPhone: '+96171555222',
        dutyStatus: 'ON_DUTY',
      },
    });
    driverId = driver.id;

    adminToken = tokens.signAccessToken({ sub: adminUser.id, role: 'ADMIN', tv: 0 });
    vendorToken = tokens.signAccessToken({
      sub: bystanderUser.id,
      role: 'VENDOR',
      tv: 0,
      vid: bystander.id,
    });
    driverToken = tokens.signAccessToken({ sub: driverUser.id, role: 'DRIVER', tv: 0, did: driver.id });
  });

  afterAll(async () => {
    await app.close();
  });

  /** A fresh vendor + its login, so each test deletes its own subject. */
  async function makeVendor(name: string, email: string) {
    const hash = await AuthService.hashPassword('password123');
    const user = await prisma.user.create({ data: { email, passwordHash: hash, role: 'VENDOR' } });
    const vendor = await prisma.vendor.create({ data: { userId: user.id, businessName: name } });
    return { vendor, user };
  }

  async function seedOrder(vendorId: string, customerId: string) {
    const seq = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    return prisma.order.create({
      data: {
        orderNumber: `ORD-DEL-${seq[0].nextval}`,
        vendorId,
        customerId,
        deliveryAddressText: 'Somewhere in Beirut',
        deliveryCharge: 100000n,
        currency: 'LBP',
        status: 'DELIVERED',
        driverId,
        commissionBps: 3000,
        platformCommissionAmount: 30000n,
        driverEarnings: 70000n,
        assignedAt: new Date(),
        pickedUpAt: new Date(),
        deliveredAt: new Date(),
      },
    });
  }

  // ------------------------------------------------------------- authorization

  it('refuses a vendor and a driver — only an admin may delete', async () => {
    const { vendor } = await makeVendor('Untouchable', 'untouchable@vend.local');

    await request(server).delete(`/api/v1/admin/vendors/${vendor.id}`).set(auth(vendorToken)).expect(403);
    await request(server).delete(`/api/v1/admin/vendors/${vendor.id}`).set(auth(driverToken)).expect(403);
    await request(server).delete(`/api/v1/admin/vendors/${vendor.id}`).expect(401);

    expect(await prisma.vendor.findUnique({ where: { id: vendor.id } })).not.toBeNull();
  });

  it('404s for a vendor that does not exist', async () => {
    await request(server)
      .delete('/api/v1/admin/vendors/does-not-exist')
      .set(auth(adminToken))
      .expect(404);
  });

  // ------------------------------------------------------------- the happy path

  it('deletes a vendor that never traded, along with its login and sessions', async () => {
    const { vendor, user } = await makeVendor('Typo Shop', 'typo@vend.local');
    // A live session, to prove the account cannot be used afterwards.
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: `hash-${user.id}`,
        familyId: `family-${user.id}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await request(server)
      .delete(`/api/v1/admin/vendors/${vendor.id}`)
      .set(auth(adminToken))
      .expect(200);

    expect(await prisma.vendor.findUnique({ where: { id: vendor.id } })).toBeNull();
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
  });

  it('frees the email so the same shop can be re-added', async () => {
    const { vendor } = await makeVendor('Retry Shop', 'retry@vend.local');
    await request(server)
      .delete(`/api/v1/admin/vendors/${vendor.id}`)
      .set(auth(adminToken))
      .expect(200);

    await request(server)
      .post('/api/v1/admin/vendors')
      .set(auth(adminToken))
      .send({ businessName: 'Retry Shop', email: 'retry@vend.local', password: 'password123' })
      .expect(201);
  });

  it('records the deletion in the audit log, which outlives the user row', async () => {
    const { vendor } = await makeVendor('Audited Shop', 'audited@vend.local');
    await request(server)
      .delete(`/api/v1/admin/vendors/${vendor.id}`)
      .set(auth(adminToken))
      .expect(200);

    // audit_logs stores actor as a plain id with no FK, so history survives.
    await new Promise((r) => setTimeout(r, 200)); // the audit write is fire-and-forget
    const entry = await prisma.auditLog.findFirst({
      where: { entityType: 'Vendor', entityId: vendor.id, action: 'VENDOR_DELETED' },
    });
    expect(entry).not.toBeNull();
  });

  // ------------------------------------------------------- the accounting rule

  it('refuses to delete a vendor that has orders, and leaves everything intact', async () => {
    const { vendor, user } = await makeVendor('Traded Shop', 'traded@vend.local');
    const customer = await prisma.customer.create({
      data: { normalizedPhone: '+96170111222', name: 'A Customer' },
    });
    await seedOrder(vendor.id, customer.id);

    const res = await request(server)
      .delete(`/api/v1/admin/vendors/${vendor.id}`)
      .set(auth(adminToken))
      .expect(409);

    expect(res.body.error.code).toBe('VENDOR_HAS_ORDERS');
    // The message must name the remedy, not just the refusal.
    expect(res.body.error.message).toMatch(/suspend/i);

    // Nothing was half-done: vendor, login and the order all survive.
    expect(await prisma.vendor.findUnique({ where: { id: vendor.id } })).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    expect(await prisma.order.count({ where: { vendorId: vendor.id } })).toBe(1);
  });

  it('suspending is the way out for a vendor that has traded', async () => {
    const { vendor } = await makeVendor('Suspend Me', 'suspend@vend.local');
    const customer = await prisma.customer.create({
      data: { normalizedPhone: '+96170111333', name: 'Another Customer' },
    });
    await seedOrder(vendor.id, customer.id);

    await request(server)
      .patch(`/api/v1/admin/vendors/${vendor.id}`)
      .set(auth(adminToken))
      .send({ status: 'SUSPENDED' })
      .expect(200);

    const after = await prisma.vendor.findUnique({ where: { id: vendor.id } });
    expect(after?.status).toBe('SUSPENDED');
    expect(await prisma.order.count({ where: { vendorId: vendor.id } })).toBe(1);
  });

  // --------------------------------------------------- what the delete leaves

  it('keeps the customers and addresses the vendor added — they belong to the platform', async () => {
    const { vendor } = await makeVendor('Adder Shop', 'adder@vend.local');
    const customer = await prisma.customer.create({
      data: { normalizedPhone: '+96170111444', name: 'Added By Vendor', createdByVendorId: vendor.id },
    });
    const address = await prisma.customerAddress.create({
      data: { customerId: customer.id, addressText: 'Hamra Street', createdByVendorId: vendor.id },
    });
    // The link row is written by a Postgres TRIGGER when a vendor adds a
    // customer, not by app code — so it already exists here, and asserting that
    // is worth more than inserting one.
    expect(await prisma.customerVendor.count({ where: { vendorId: vendor.id } })).toBe(1);

    await request(server)
      .delete(`/api/v1/admin/vendors/${vendor.id}`)
      .set(auth(adminToken))
      .expect(200);

    // The customer and address survive, having lost only their attribution.
    const c = await prisma.customer.findUnique({ where: { id: customer.id } });
    const a = await prisma.customerAddress.findUnique({ where: { id: address.id } });
    expect(c).not.toBeNull();
    expect(c?.createdByVendorId).toBeNull();
    expect(a).not.toBeNull();
    expect(a?.createdByVendorId).toBeNull();

    // The private relationship row goes with the vendor.
    expect(await prisma.customerVendor.count({ where: { vendorId: vendor.id } })).toBe(0);
  });

  // ------------------------------------------------------------------ drivers

  describe('drivers', () => {
    async function makeDriver(name: string, phone: string) {
      const hash = await AuthService.hashPassword('password123');
      const user = await prisma.user.create({
        data: { normalizedPhone: phone, passwordHash: hash, role: 'DRIVER' },
      });
      const driver = await prisma.driver.create({
        data: { userId: user.id, fullName: name, contactPhone: phone },
      });
      return { driver, user };
    }

    /** An order for a specific driver, in a specific status. */
    async function seedOrderFor(
      vendorId: string,
      customerId: string,
      forDriverId: string,
      status: 'DELIVERED' | 'CANCELLED',
    ) {
      const seq = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
      return prisma.order.create({
        data: {
          orderNumber: `ORD-DRV-${seq[0].nextval}`,
          vendorId,
          customerId,
          deliveryAddressText: 'Somewhere',
          deliveryCharge: 100000n,
          currency: 'LBP',
          status,
          driverId: forDriverId,
          commissionBps: 3000,
          platformCommissionAmount: 30000n,
          driverEarnings: 70000n,
          assignedAt: new Date(),
          ...(status === 'DELIVERED'
            ? { pickedUpAt: new Date(), deliveredAt: new Date() }
            : { cancelledAt: new Date() }),
        },
      });
    }

    it('deletes a driver who never carried anything, with their login', async () => {
      const { driver, user } = await makeDriver('Never Rode', '+96171000001');

      await request(server)
        .delete(`/api/v1/admin/drivers/${driver.id}`)
        .set(auth(adminToken))
        .expect(200);

      expect(await prisma.driver.findUnique({ where: { id: driver.id } })).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    });

    it('refuses a driver who has carried orders', async () => {
      const { driver } = await makeDriver('Has Ridden', '+96171000002');
      const customer = await prisma.customer.create({
        data: { normalizedPhone: '+96170222111', name: 'Driver Order Customer' },
      });
      const { vendor } = await makeVendor('Driver Order Shop', 'driverorder@vend.local');
      await seedOrderFor(vendor.id, customer.id, driver.id, 'DELIVERED');

      const res = await request(server)
        .delete(`/api/v1/admin/drivers/${driver.id}`)
        .set(auth(adminToken))
        .expect(409);

      expect(res.body.error.code).toBe('DRIVER_HAS_ORDERS');
      expect(res.body.error.message).toMatch(/suspend/i);
      expect(await prisma.driver.findUnique({ where: { id: driver.id } })).not.toBeNull();
    });

    /**
     * What the database actually does, so the guard's real value is on record.
     *
     * orders.driver_id is ON DELETE SET NULL, but the order_status_driver_coupling
     * CHECK requires a driver on any order in DRIVER_ASSIGNED / PICKED_UP /
     * DELIVERED / FAILED. So deleting a driver with a delivered order does NOT
     * silently blank them off it — Postgres refuses the whole delete with a
     * constraint violation. The service check is not the last line of defence;
     * what it adds is a 409 that names the remedy instead of an opaque 500.
     */
    it('a delivered order blocks the raw delete at the database', async () => {
      const { driver } = await makeDriver('Bypass Me', '+96171000003');
      const customer = await prisma.customer.create({
        data: { normalizedPhone: '+96170222222', name: 'Bypass Customer' },
      });
      const { vendor } = await makeVendor('Bypass Shop', 'bypass@vend.local');
      const order = await seedOrderFor(vendor.id, customer.id, driver.id, 'DELIVERED');

      await expect(prisma.driver.delete({ where: { id: driver.id } })).rejects.toThrow(
        /order_status_driver_coupling/,
      );

      const after = await prisma.order.findUnique({ where: { id: order.id } });
      expect(after?.driverId).toBe(driver.id); // still attached
      expect(after?.driverEarnings).toBe(70000n);
    });

    /**
     * The gap the CHECK deliberately leaves. A CANCELLED order "may or may not
     * carry a driver", so SET NULL is permitted there — a raw delete DOES
     * silently detach the driver from an order they were once assigned. Narrow,
     * but real, and the service guard is the only thing covering it.
     */
    it('a cancelled order is silently detached by a raw delete — the guard covers it', async () => {
      const { driver } = await makeDriver('Cancelled Ride', '+96171000004');
      const customer = await prisma.customer.create({
        data: { normalizedPhone: '+96170222333', name: 'Cancelled Customer' },
      });
      const { vendor } = await makeVendor('Cancelled Shop', 'cancelled@vend.local');
      const order = await seedOrderFor(vendor.id, customer.id, driver.id, 'CANCELLED');

      // The API refuses, which is the point.
      await request(server)
        .delete(`/api/v1/admin/drivers/${driver.id}`)
        .set(auth(adminToken))
        .expect(409);

      // But the raw delete succeeds and quietly loses who was assigned.
      await prisma.driver.delete({ where: { id: driver.id } });
      const after = await prisma.order.findUnique({ where: { id: order.id } });
      expect(after).not.toBeNull();
      expect(after?.driverId).toBeNull();
    });
  });

  // ---------------------------------------------------------------- customers

  describe('customers', () => {
    it('deletes a customer with no orders, and their addresses go too', async () => {
      const customer = await prisma.customer.create({
        data: { normalizedPhone: '+96170333111', name: 'Wrong Number' },
      });
      const address = await prisma.customerAddress.create({
        data: { customerId: customer.id, addressText: 'Mistyped Street' },
      });

      await request(server)
        .delete(`/api/v1/admin/customers/${customer.id}`)
        .set(auth(adminToken))
        .expect(200);

      expect(await prisma.customer.findUnique({ where: { id: customer.id } })).toBeNull();
      expect(await prisma.customerAddress.findUnique({ where: { id: address.id } })).toBeNull();
    });

    it('refuses a customer named on an order, with no suspend to offer', async () => {
      const customer = await prisma.customer.create({
        data: { normalizedPhone: '+96170333222', name: 'Real Customer' },
      });
      const { vendor } = await makeVendor('Cust Order Shop', 'custorder@vend.local');
      await seedOrder(vendor.id, customer.id);

      const res = await request(server)
        .delete(`/api/v1/admin/customers/${customer.id}`)
        .set(auth(adminToken))
        .expect(409);

      expect(res.body.error.code).toBe('CUSTOMER_HAS_ORDERS');
      expect(await prisma.customer.findUnique({ where: { id: customer.id } })).not.toBeNull();
    });

    it('only an admin may delete a customer', async () => {
      const customer = await prisma.customer.create({
        data: { normalizedPhone: '+96170333333', name: 'Protected' },
      });
      await request(server)
        .delete(`/api/v1/admin/customers/${customer.id}`)
        .set(auth(vendorToken))
        .expect(403);
      expect(await prisma.customer.findUnique({ where: { id: customer.id } })).not.toBeNull();
    });
  });
});
