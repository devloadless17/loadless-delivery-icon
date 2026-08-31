import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthService } from '../../src/auth/auth.service';
import { TokenService } from '../../src/auth/token.service';

/**
 * Customer 360. The authorization pairs matter most: customers are GLOBAL, but
 * a vendor's trade with them is not. A slip here leaks a competitor's business.
 */
describe('customers (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  let vendorAToken: string;
  let vendorBToken: string;
  let adminToken: string;
  let driverToken: string;
  let vendorAId: string;
  let vendorBId: string;
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
      `TRUNCATE TABLE order_status_history, orders, customer_change_history,
       customer_vendors, customer_addresses, customers, audit_logs, refresh_tokens,
       file_objects, drivers, vendors, users CASCADE`,
    );
    await prisma.platformSetting.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', defaultCommissionBps: 3000 },
      update: { defaultCommissionBps: 3000 },
    });

    const hash = await AuthService.hashPassword('password123');
    const adminUser = await prisma.user.create({
      data: { email: 'admin@cust.local', passwordHash: hash, role: 'ADMIN' },
    });
    const vendorAUser = await prisma.user.create({
      data: { email: 'vendor-a@cust.local', passwordHash: hash, role: 'VENDOR' },
    });
    const vendorBUser = await prisma.user.create({
      data: { email: 'vendor-b@cust.local', passwordHash: hash, role: 'VENDOR' },
    });
    const driverUser = await prisma.user.create({
      data: { normalizedPhone: '+96171555111', passwordHash: hash, role: 'DRIVER' },
    });

    const vendorA = await prisma.vendor.create({
      data: { userId: vendorAUser.id, businessName: 'Vendor A Shop' },
    });
    const vendorB = await prisma.vendor.create({
      data: { userId: vendorBUser.id, businessName: 'Vendor B Shop' },
    });
    const driver = await prisma.driver.create({
      data: {
        userId: driverUser.id,
        fullName: 'Test Driver',
        contactPhone: '+96171555111',
        dutyStatus: 'ON_DUTY',
      },
    });
    vendorAId = vendorA.id;
    vendorBId = vendorB.id;
    driverId = driver.id;

    adminToken = tokens.signAccessToken({ sub: adminUser.id, role: 'ADMIN', tv: 0 });
    vendorAToken = tokens.signAccessToken({ sub: vendorAUser.id, role: 'VENDOR', tv: 0, vid: vendorA.id });
    vendorBToken = tokens.signAccessToken({ sub: vendorBUser.id, role: 'VENDOR', tv: 0, vid: vendorB.id });
    driverToken = tokens.signAccessToken({ sub: driverUser.id, role: 'DRIVER', tv: 0, did: driver.id });
  });

  afterAll(async () => {
    await app.close();
  });

  /** Creates an order directly so tests control vendor, status and address. */
  async function seedOrder(opts: {
    vendorId: string;
    customerId: string;
    addressText: string;
    mapsUrl?: string | null;
    status?: 'PENDING' | 'DELIVERED' | 'CANCELLED' | 'FAILED';
    charge?: bigint;
    currency?: 'LBP' | 'USD';
    createdAt?: Date;
  }) {
    const status = opts.status ?? 'DELIVERED';
    const assigned = status !== 'PENDING' && status !== 'CANCELLED';
    const seq = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    return prisma.order.create({
      data: {
        orderNumber: `ORD-TEST-${seq[0].nextval}`,
        vendorId: opts.vendorId,
        customerId: opts.customerId,
        deliveryAddressText: opts.addressText,
        deliveryMapsUrl: opts.mapsUrl ?? null,
        deliveryCharge: opts.charge ?? 100000n,
        currency: opts.currency ?? 'LBP',
        status,
        ...(assigned
          ? {
              driverId,
              commissionBps: 3000,
              platformCommissionAmount: (opts.charge ?? 100000n) * 3n / 10n,
              driverEarnings: (opts.charge ?? 100000n) - ((opts.charge ?? 100000n) * 3n) / 10n,
              assignedAt: new Date(),
              ...(status === 'DELIVERED'
                ? { pickedUpAt: new Date(), deliveredAt: new Date() }
                : status === 'FAILED'
                  ? { pickedUpAt: new Date() }
                  : {}),
            }
          : {}),
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      },
    });
  }

  /**
   * `createdByVendorId` now decides who may rename the customer and who owns
   * the addresses they add, so tests that exercise editing must say who added
   * them. Left NULL it is a platform-owned record: admin-editable only.
   */
  async function makeCustomer(phone: string, name: string, createdByVendorId?: string) {
    return prisma.customer.create({
      data: { normalizedPhone: phone, name, ...(createdByVendorId ? { createdByVendorId } : {}) },
    });
  }

  // ------------------------------------------------------------- authorization

  describe('authorization — the vendor boundary', () => {
    it('vendor B sees the shared identity but ZERO of vendor A\'s trade', async () => {
      const customer = await makeCustomer('+9613100001', 'Shared Person');
      await prisma.customerAddress.create({
        data: { customerId: customer.id, label: 'HOME', addressText: 'Hamra Bldg 12' },
      });
      await seedOrder({ vendorId: vendorAId, customerId: customer.id, addressText: 'Hamra Bldg 12' });
      await seedOrder({ vendorId: vendorAId, customerId: customer.id, addressText: 'Hamra Bldg 12' });

      const asA = await request(server)
        .get('/api/v1/customers?phone=03100001')
        .set(auth(vendorAToken))
        .expect(200);
      const asB = await request(server)
        .get('/api/v1/customers?phone=03100001')
        .set(auth(vendorBToken))
        .expect(200);

      // Identity is global — both see the person and their address book.
      expect(asB.body.data.customer.name).toBe('Shared Person');
      expect(asB.body.data.customer.addresses).toHaveLength(1);

      // Trade is not.
      expect(asA.body.data.customer.stats.ordersInScope).toBe(2);
      expect(asB.body.data.customer.stats.ordersInScope).toBe(0);
      expect(asB.body.data.customer.recentOrders).toEqual([]);
      expect(asB.body.data.customer.stats.topAddress).toBeNull();
      expect(asA.body.data.customer.stats.topAddress.orderCount).toBe(2);

      // The one deliberate cross-vendor signal, asserted against its own pair.
      expect(asB.body.data.customer.stats.totalOrdersPlatform).toBe(2);
      expect(asB.body.data.customer.stats.scope).toBe('VENDOR');
    });

    it('order history is vendor-scoped; admin sees everything with vendor names', async () => {
      const customer = await makeCustomer('+9613100002', 'History Person');
      await seedOrder({ vendorId: vendorAId, customerId: customer.id, addressText: 'A street' });
      await seedOrder({ vendorId: vendorBId, customerId: customer.id, addressText: 'B street' });

      const asA = await request(server)
        .get(`/api/v1/customers/${customer.id}/orders`)
        .set(auth(vendorAToken))
        .expect(200);
      expect(asA.body.data).toHaveLength(1);
      expect(asA.body.data[0].deliveryAddressText).toBe('A street');
      expect(asA.body.data[0].vendorName).toBeUndefined();

      const asB = await request(server)
        .get(`/api/v1/customers/${customer.id}/orders`)
        .set(auth(vendorBToken))
        .expect(200);
      expect(asB.body.data).toHaveLength(1);
      expect(asB.body.data[0].deliveryAddressText).toBe('B street');

      const asAdmin = await request(server)
        .get(`/api/v1/customers/${customer.id}/orders`)
        .set(auth(adminToken))
        .expect(200);
      expect(asAdmin.body.data).toHaveLength(2);
      expect(asAdmin.body.data.map((o: { vendorName: string }) => o.vendorName).sort()).toEqual([
        'Vendor A Shop',
        'Vendor B Shop',
      ]);
    });

    it('a vendorId query parameter cannot widen a vendor\'s scope', async () => {
      const customer = await makeCustomer('+9613100003', 'Injection Target');
      await seedOrder({ vendorId: vendorAId, customerId: customer.id, addressText: 'A only' });

      for (const qs of [`vendorId=${vendorAId}`, `vendorId[]=${vendorAId}`, `vendorId=`]) {
        const res = await request(server)
          .get(`/api/v1/customers/${customer.id}/orders?${qs}`)
          .set(auth(vendorBToken))
          .expect(200);
        expect(res.body.data).toEqual([]);
      }
    });

    it('never leaks the commission split to a vendor', async () => {
      const customer = await makeCustomer('+9613100004', 'Money Person');
      await seedOrder({ vendorId: vendorAId, customerId: customer.id, addressText: 'Somewhere' });

      const profile = await request(server)
        .get('/api/v1/customers?phone=03100004')
        .set(auth(vendorAToken))
        .expect(200);
      const history = await request(server)
        .get(`/api/v1/customers/${customer.id}/orders`)
        .set(auth(vendorAToken))
        .expect(200);

      for (const blob of [JSON.stringify(profile.body), JSON.stringify(history.body)]) {
        expect(blob).not.toContain('commissionBps');
        expect(blob).not.toContain('platformCommissionAmount');
        expect(blob).not.toContain('driverEarnings');
        expect(blob).not.toContain('Vendor A Shop');
      }
    });

    it('drivers cannot reach customer records at all', async () => {
      await request(server)
        .get('/api/v1/customers?phone=03100001')
        .set(auth(driverToken))
        .expect(403);
    });
  });

  // -------------------------------------------------------- profile correctness

  describe('profile correctness', () => {
    it('groups money by currency and never merges LBP with USD', async () => {
      const customer = await makeCustomer('+9613100005', 'Two Currency');
      await seedOrder({ vendorId: vendorAId, customerId: customer.id, addressText: 'X', charge: 100000n });
      await seedOrder({ vendorId: vendorAId, customerId: customer.id, addressText: 'X', charge: 50000n });
      await seedOrder({
        vendorId: vendorAId, customerId: customer.id, addressText: 'X',
        charge: 1250n, currency: 'USD',
      });
      // A cancelled order must not move the money.
      await seedOrder({
        vendorId: vendorAId, customerId: customer.id, addressText: 'X',
        charge: 999999n, status: 'CANCELLED',
      });

      const res = await request(server)
        .get('/api/v1/customers?phone=03100005')
        .set(auth(vendorAToken))
        .expect(200);
      const spend = res.body.data.customer.stats.deliveredSpend;

      expect(spend).toHaveLength(2);
      expect(spend.find((s: { currency: string }) => s.currency === 'LBP')).toMatchObject({
        amount: '150000',
        orders: 2,
      });
      expect(spend.find((s: { currency: string }) => s.currency === 'USD')).toMatchObject({
        amount: '1250',
        orders: 1,
      });
      expect(res.body.data.customer.stats.cancelled).toBe(1);
      expect(res.body.data.customer.stats.delivered).toBe(3);
    });

    it('topAddress groups case/whitespace variants and counts as a NUMBER', async () => {
      const customer = await makeCustomer('+9613100006', 'Usual Place');
      await seedOrder({ vendorId: vendorAId, customerId: customer.id, addressText: 'Hamra Bldg 12' });
      await seedOrder({ vendorId: vendorAId, customerId: customer.id, addressText: 'hamra  bldg 12' });
      await seedOrder({ vendorId: vendorAId, customerId: customer.id, addressText: 'Hamra Bldg 12 ' });
      await seedOrder({ vendorId: vendorAId, customerId: customer.id, addressText: 'Verdun' });

      const res = await request(server)
        .get('/api/v1/customers?phone=03100006')
        .set(auth(vendorAToken))
        .expect(200);
      const top = res.body.data.customer.stats.topAddress;

      expect(top.orderCount).toBe(3);
      // The bigint trap: COUNT(*) must not serialize as a string.
      expect(typeof top.orderCount).toBe('number');
      expect(top.addressText.toLowerCase()).toContain('hamra');
    });

    it('unknown phone is null (not 404); unknown id is 404', async () => {
      const res = await request(server)
        .get('/api/v1/customers?phone=03999999')
        .set(auth(vendorAToken))
        .expect(200);
      expect(res.body.data.customer).toBeNull();

      await request(server)
        .get('/api/v1/customers/clzzzzzzzzzzzzzzzzzzzzzz')
        .set(auth(vendorAToken))
        .expect(404);
    });

    it('caps recentOrders at 5, newest first, and offers a cursor', async () => {
      const customer = await makeCustomer('+9613100007', 'Frequent Buyer');
      for (let i = 0; i < 7; i++) {
        await seedOrder({
          vendorId: vendorAId, customerId: customer.id, addressText: `Stop ${i}`,
          createdAt: new Date(Date.now() - (7 - i) * 60_000),
        });
      }
      const res = await request(server)
        .get('/api/v1/customers?phone=03100007')
        .set(auth(vendorAToken))
        .expect(200);
      const profile = res.body.data.customer;

      expect(profile.recentOrders).toHaveLength(5);
      expect(profile.recentOrders[0].deliveryAddressText).toBe('Stop 6'); // newest
      expect(profile.stats.ordersInScope).toBe(7);
      expect(profile.recentOrdersNextCursor).not.toBeNull();
    });

    it('pages the full history with a cursor, no gaps or repeats', async () => {
      const customer = await prisma.customer.findUniqueOrThrow({
        where: { normalizedPhone: '+9613100007' },
      });
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 5; page++) {
        const url: string = `/api/v1/customers/${customer.id}/orders?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
        const res = await request(server).get(url).set(auth(vendorAToken)).expect(200);
        seen.push(...res.body.data.map((o: { id: string }) => o.id));
        cursor = res.body.meta.nextCursor;
        if (!cursor) break;
      }
      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
    });
  });

  // ------------------------------------------------------------ address editing

  describe('address editing', () => {
    it('updates in place and writes exactly one history row', async () => {
      const customer = await makeCustomer('+9613100010', 'Edit Me', vendorAId);
      const address = await prisma.customerAddress.create({
        data: {
          customerId: customer.id,
          label: 'OTHER',
          addressText: 'Typo steet',
          createdByVendorId: vendorAId, // vendor A owns it, so vendor A may fix it
        },
      });
      const before = await prisma.customerChangeHistory.count({ where: { customerId: customer.id } });

      const res = await request(server)
        .patch(`/api/v1/customers/${customer.id}/addresses/${address.id}`)
        .set(auth(vendorAToken))
        .send({ label: 'WORK', addressText: 'Typo street, Bldg 4', mapsUrl: 'https://maps.app.goo.gl/abc' })
        .expect(200);

      expect(res.body.data).toMatchObject({
        label: 'WORK',
        addressText: 'Typo street, Bldg 4',
        mapsUrl: 'https://maps.app.goo.gl/abc',
      });
      const after = await prisma.customerChangeHistory.count({ where: { customerId: customer.id } });
      expect(after - before).toBe(1);
    });

    it('a no-op edit writes NO history', async () => {
      const customer = await prisma.customer.findUniqueOrThrow({
        where: { normalizedPhone: '+9613100010' },
      });
      const address = await prisma.customerAddress.findFirstOrThrow({
        where: { customerId: customer.id },
      });
      const before = await prisma.customerChangeHistory.count({ where: { customerId: customer.id } });

      await request(server)
        .patch(`/api/v1/customers/${customer.id}/addresses/${address.id}`)
        .set(auth(vendorAToken))
        .send({ label: address.label, addressText: address.addressText })
        .expect(200);

      const after = await prisma.customerChangeHistory.count({ where: { customerId: customer.id } });
      expect(after).toBe(before);
    });

    it('clears a stale maps link with null', async () => {
      const customer = await prisma.customer.findUniqueOrThrow({
        where: { normalizedPhone: '+9613100010' },
      });
      const address = await prisma.customerAddress.findFirstOrThrow({
        where: { customerId: customer.id },
      });
      const res = await request(server)
        .patch(`/api/v1/customers/${customer.id}/addresses/${address.id}`)
        .set(auth(vendorAToken))
        .send({ mapsUrl: null })
        .expect(200);
      expect(res.body.data.mapsUrl).toBeNull();
    });

    it('404s on a foreign or archived address, leaving it untouched', async () => {
      const mine = await makeCustomer('+9613100011', 'Owner', vendorAId);
      const other = await makeCustomer('+9613100012', 'Other Owner', vendorAId);
      // Both are OWNED by the caller: so a 404 here proves the wrong-customer
      // and archived checks fire BEFORE the ownership check, and can never be
      // mistaken for a 403 in disguise.
      const foreign = await prisma.customerAddress.create({
        data: {
          customerId: other.id,
          label: 'HOME',
          addressText: 'Not yours',
          createdByVendorId: vendorAId,
        },
      });
      const archived = await prisma.customerAddress.create({
        data: {
          customerId: mine.id,
          label: 'HOME',
          addressText: 'Gone',
          isArchived: true,
          createdByVendorId: vendorAId,
        },
      });

      await request(server)
        .patch(`/api/v1/customers/${mine.id}/addresses/${foreign.id}`)
        .set(auth(vendorAToken))
        .send({ addressText: 'Hijacked' })
        .expect(404);
      await request(server)
        .patch(`/api/v1/customers/${mine.id}/addresses/${archived.id}`)
        .set(auth(vendorAToken))
        .send({ addressText: 'Resurrected' })
        .expect(404);

      expect((await prisma.customerAddress.findUniqueOrThrow({ where: { id: foreign.id } })).addressText)
        .toBe('Not yours');
      expect((await prisma.customerAddress.findUniqueOrThrow({ where: { id: archived.id } })).addressText)
        .toBe('Gone');
    });
  });

  // -------------------------------------------------------------------- dedupe

  describe('address dedupe', () => {
    it('collapses case/whitespace variants into ONE saved address', async () => {
      const customer = await makeCustomer('+9613100020', 'Dedupe Person');
      for (const text of ['Hamra Bldg 12', 'hamra  bldg 12', 'HAMRA BLDG 12 ']) {
        await request(server)
          .post(`/api/v1/customers/${customer.id}/addresses`)
          .set(auth(vendorAToken))
          .send({ label: 'HOME', addressText: text })
          .expect(201);
      }
      const rows = await prisma.customerAddress.findMany({
        where: { customerId: customer.id, isArchived: false },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.addressText).toBe('Hamra Bldg 12'); // first spelling wins
    });

    it('backfills a missing maps link without rewriting the address', async () => {
      const customer = await prisma.customer.findUniqueOrThrow({
        where: { normalizedPhone: '+9613100020' },
      });
      await request(server)
        .post(`/api/v1/customers/${customer.id}/addresses`)
        .set(auth(vendorAToken))
        .send({ label: 'HOME', addressText: 'hamra bldg 12', mapsUrl: 'https://maps.app.goo.gl/xyz' })
        .expect(201);

      const rows = await prisma.customerAddress.findMany({
        where: { customerId: customer.id, isArchived: false },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.mapsUrl).toBe('https://maps.app.goo.gl/xyz');
      expect(rows[0]?.addressText).toBe('Hamra Bldg 12'); // untouched
    });

    it('labels the first address HOME and later ones OTHER, unless told', async () => {
      const customer = await makeCustomer('+9613100021', 'Label Person');
      const post = (body: Record<string, unknown>) =>
        request(server)
          .post(`/api/v1/customers/${customer.id}/addresses`)
          .set(auth(vendorAToken))
          .send(body)
          .expect(201);

      // The DTO defaults label to OTHER, so omit it entirely to test the fallback.
      await prisma.$transaction(async () => undefined);
      await post({ addressText: 'First place' });
      await post({ addressText: 'Second place' });
      await post({ label: 'WORK', addressText: 'Third place' });

      const rows = await prisma.customerAddress.findMany({
        where: { customerId: customer.id, isArchived: false },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.map((r) => r.label)).toEqual(['OTHER', 'OTHER', 'WORK']);
    });

    it('RACE: concurrent orders for the same place create exactly one address', async () => {
      const customer = await makeCustomer('+9613100022', 'Race Person');
      const body = (vendorToken: string) =>
        request(server)
          .post('/api/v1/vendor/orders')
          .set(auth(vendorToken))
          .send({
            customerPhone: '03100022',
            deliveryAddressText: 'Concurrent street 5',
            saveAddressToCustomer: true,
            deliveryCharge: '100000',
            currency: 'LBP',
          });

      const [a, b] = await Promise.all([body(vendorAToken), body(vendorBToken)]);
      expect([a.status, b.status]).toEqual([201, 201]);

      const rows = await prisma.customerAddress.findMany({
        where: { customerId: customer.id, isArchived: false },
      });
      expect(rows).toHaveLength(1);
    });

    it('order creation honours an explicit save label', async () => {
      await request(server)
        .post('/api/v1/vendor/orders')
        .set(auth(vendorAToken))
        .send({
          customerPhone: '03100023',
          customerName: 'Labelled Save',
          deliveryAddressText: 'Office tower, 5th floor',
          saveAddressToCustomer: true,
          saveAddressLabel: 'WORK',
          deliveryCharge: '80000',
          currency: 'LBP',
        })
        .expect(201);

      const customer = await prisma.customer.findUniqueOrThrow({
        where: { normalizedPhone: '+9613100023' },
      });
      const rows = await prisma.customerAddress.findMany({ where: { customerId: customer.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.label).toBe('WORK');
    });
  });

  // ---------------------------------------------------------------- create/admin

  describe('creation', () => {
    it('admin can create a customer, attributed to no vendor', async () => {
      const res = await request(server)
        .post('/api/v1/customers')
        .set(auth(adminToken))
        .send({ phone: '03100030', name: 'Admin Made', address: { label: 'HOME', addressText: 'Admin street' } })
        .expect(200);

      expect(res.body.data.created).toBe(true);
      expect(res.body.data.customer.createdByVendorId).toBeNull();
      expect(res.body.data.customer.addresses).toHaveLength(1);
      expect(res.body.data.customer.stats.scope).toBe('PLATFORM');
    });

    it('creating an existing phone reuses the record and returns its profile', async () => {
      const res = await request(server)
        .post('/api/v1/customers')
        .set(auth(vendorAToken))
        .send({ phone: '+961 3 100 030', name: 'Different Name' })
        .expect(200);

      expect(res.body.data.created).toBe(false);
      expect(res.body.data.customer.name).toBe('Admin Made'); // global record wins
      expect(await prisma.customer.count({ where: { normalizedPhone: '+9613100030' } })).toBe(1);
    });
  });

  // -------------------------------------------------- location: text OR link

  describe('a shared maps link is a complete location', () => {
    it('creates a customer address from a link alone', async () => {
      const res = await request(server)
        .post('/api/v1/customers')
        .set(auth(vendorAToken))
        .send({
          phone: '03100040',
          name: 'Pin Only',
          address: { label: 'HOME', mapsUrl: 'https://maps.app.goo.gl/pin-only-1' },
        })
        .expect(200);

      const [address] = res.body.data.customer.addresses;
      expect(address.addressText).toBeNull();
      expect(address.mapsUrl).toBe('https://maps.app.goo.gl/pin-only-1');
    });

    it('creates an ORDER from a link alone', async () => {
      const res = await request(server)
        .post('/api/v1/vendor/orders')
        .set(auth(vendorAToken))
        .send({
          customerPhone: '03100041',
          customerName: 'Pin Only Order',
          deliveryMapsUrl: 'https://maps.app.goo.gl/pin-order',
          deliveryCharge: '100000',
          currency: 'LBP',
        })
        .expect(201);
      expect(res.body.data.deliveryAddressText).toBeNull();
      expect(res.body.data.deliveryMapsUrl).toBe('https://maps.app.goo.gl/pin-order');
    });

    it('still rejects a location with neither text nor link', async () => {
      const res = await request(server)
        .post('/api/v1/vendor/orders')
        .set(auth(vendorAToken))
        .send({ customerPhone: '03100042', customerName: 'No Location', deliveryCharge: '100000' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('Add an address or paste a Google Maps link');
    });

    it('dedupes two link-only saves of the same pin', async () => {
      const customer = await prisma.customer.findUniqueOrThrow({
        where: { normalizedPhone: '+9613100040' },
      });
      await request(server)
        .post(`/api/v1/customers/${customer.id}/addresses`)
        .set(auth(vendorBToken))
        .send({ label: 'WORK', mapsUrl: 'https://maps.app.goo.gl/pin-only-1' })
        .expect(201);

      const rows = await prisma.customerAddress.findMany({
        where: { customerId: customer.id, isArchived: false },
      });
      expect(rows).toHaveLength(1);
    });
  });
  // ------------------------------------------ the vendor <-> customer relationship

  describe('my customers — the list is bounded to my own', () => {
    it('THE LEAK TEST: a name search never reaches another vendor\'s customer', async () => {
      const theirs = await makeCustomer('+9613100100', 'Findable Person', vendorBId);
      const mine = await makeCustomer('+9613100101', 'Findable Mine', vendorAId);

      const res = await request(server)
        .get('/api/v1/vendor/customers?q=Findable')
        .set(auth(vendorAToken))
        .expect(200);

      const ids = res.body.data.map((r: { id: string }) => r.id);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(theirs.id);
      // Not even the name leaks — the whole point of withholding enumeration.
      expect(JSON.stringify(res.body)).not.toContain('Findable Person');
    });

    it('a vendorId parameter cannot widen the list; drivers get nothing', async () => {
      for (const qs of [`vendorId=${vendorBId}`, `vendorId[]=${vendorBId}`, 'vendorId=']) {
        const res = await request(server)
          .get(`/api/v1/vendor/customers?q=Findable&${qs}`)
          .set(auth(vendorAToken))
          .expect(200);
        expect(res.body.data.every((r: { name: string }) => r.name !== 'Findable Person')).toBe(true);
      }
      await request(server).get('/api/v1/vendor/customers').set(auth(driverToken)).expect(403);
      await request(server).get('/api/v1/vendor/customers').set(auth(adminToken)).expect(403);
    });

    it('finds a customer from a PARTIAL number typed the way people type it', async () => {
      // Numbers are stored "+9613100101" — the leading 0 is dropped on the way
      // in. Matching the literal typed "03 100 1" would find nothing, which is
      // exactly the bug this asserts against.
      for (const typed of ['03 100 1', '03100', '3 100 1', '+961 3 100 1']) {
        const res = await request(server)
          .get(`/api/v1/vendor/customers?q=${encodeURIComponent(typed)}`)
          .set(auth(vendorAToken))
          .expect(200);
        const phones = res.body.data.map((r: { normalizedPhone: string }) => r.normalizedPhone);
        expect(phones).toContain('+9613100101');
        // …and the prefix still cannot reach vendor B's customer on the same one.
        expect(phones).not.toContain('+9613100100');
      }
    });

    it('finds a customer from a partial NAME, among mine only', async () => {
      const res = await request(server)
        .get('/api/v1/vendor/customers?q=finda')
        .set(auth(vendorAToken))
        .expect(200);
      const names = res.body.data.map((r: { name: string }) => r.name);
      expect(names).toContain('Findable Mine');
      expect(names).not.toContain('Findable Person');
    });

    it('creating a customer links them at zero orders; ordering counts up', async () => {
      const created = await request(server)
        .post('/api/v1/customers')
        .set(auth(vendorAToken))
        .send({ phone: '03100110', name: 'Link Lifecycle' })
        .expect(200);
      const customerId = created.body.data.customer.id;

      const link = await prisma.customerVendor.findUniqueOrThrow({
        where: { customerId_vendorId: { customerId, vendorId: vendorAId } },
      });
      expect(link.ordersCount).toBe(0);
      expect(link.lastOrderAt).toBeNull();

      await seedOrder({ vendorId: vendorAId, customerId, addressText: 'Somewhere' });
      await seedOrder({ vendorId: vendorAId, customerId, addressText: 'Somewhere' });
      const after = await prisma.customerVendor.findUniqueOrThrow({
        where: { customerId_vendorId: { customerId, vendorId: vendorAId } },
      });
      expect(after.ordersCount).toBe(2);
      expect(after.lastOrderAt).not.toBeNull();

      const list = await request(server)
        .get('/api/v1/vendor/customers?q=Link Lifecycle')
        .set(auth(vendorAToken))
        .expect(200);
      expect(list.body.data[0]).toMatchObject({ ordersCount: 2, addedByYou: true });
      // The bigint trap: COUNT(*) must arrive as a JSON number, not "2".
      expect(typeof list.body.data[0].addressCount).toBe('number');
      expect(typeof list.body.data[0].ordersCount).toBe('number');
    });

    it('RACE: two vendors ordering at once produce two links, one order each', async () => {
      const customer = await makeCustomer('+9613100111', 'Race Link');
      await Promise.all([
        seedOrder({ vendorId: vendorAId, customerId: customer.id, addressText: 'A' }),
        seedOrder({ vendorId: vendorBId, customerId: customer.id, addressText: 'B' }),
      ]);
      const links = await prisma.customerVendor.findMany({ where: { customerId: customer.id } });
      expect(links).toHaveLength(2);
      expect(links.map((l) => l.ordersCount).sort()).toEqual([1, 1]);
    });

    it('a cancelled order still counts — the relationship happened', async () => {
      const customer = await makeCustomer('+9613100112', 'Cancelled Link');
      await seedOrder({
        vendorId: vendorAId,
        customerId: customer.id,
        addressText: 'X',
        status: 'CANCELLED',
      });
      const link = await prisma.customerVendor.findUniqueOrThrow({
        where: { customerId_vendorId: { customerId: customer.id, vendorId: vendorAId } },
      });
      expect(link.ordersCount).toBe(1);
    });
  });

  describe('names — global vs mine', () => {
    it('only the vendor who added them may rewrite the shared name', async () => {
      const customer = await makeCustomer('+9613100120', 'Original Name', vendorAId);

      await request(server)
        .patch(`/api/v1/customers/${customer.id}`)
        .set(auth(vendorAToken))
        .send({ name: 'Corrected Name' })
        .expect(200);

      const res = await request(server)
        .patch(`/api/v1/customers/${customer.id}`)
        .set(auth(vendorBToken))
        .send({ name: 'Hijacked Name' })
        .expect(403);
      expect(res.body.error.code).toBe('NAME_NOT_YOURS');
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).name).toBe(
        'Corrected Name',
      );

      await request(server)
        .patch(`/api/v1/customers/${customer.id}`)
        .set(auth(adminToken))
        .send({ name: 'Admin Name' })
        .expect(200);
    });

    it('my alias is mine alone — the other vendor keeps the shared name', async () => {
      const customer = await makeCustomer('+9613100121', 'Shared Spelling', vendorAId);

      const set = await request(server)
        .put(`/api/v1/customers/${customer.id}/display-name`)
        .set(auth(vendorBToken))
        .send({ displayName: 'B’s Nickname' })
        .expect(200);
      expect(set.body.data).toMatchObject({
        name: 'B’s Nickname',
        baseName: 'Shared Spelling',
        displayName: 'B’s Nickname',
        nameScope: 'MINE',
      });

      const asA = await request(server)
        .get(`/api/v1/customers/${customer.id}`)
        .set(auth(vendorAToken))
        .expect(200);
      expect(asA.body.data.name).toBe('Shared Spelling');
      expect(asA.body.data.displayName).toBeNull();
      expect(asA.body.data.nameScope).toBe('GLOBAL'); // A added them
      expect(JSON.stringify(asA.body)).not.toContain('Nickname');

      // The shared record itself never moved.
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).name).toBe(
        'Shared Spelling',
      );

      // Clearing it returns to following the shared record.
      await request(server)
        .delete(`/api/v1/customers/${customer.id}/display-name`)
        .set(auth(vendorBToken))
        .expect(200);
      const cleared = await request(server)
        .get(`/api/v1/customers/${customer.id}`)
        .set(auth(vendorBToken))
        .expect(200);
      expect(cleared.body.data.name).toBe('Shared Spelling');
      expect(cleared.body.data.displayName).toBeNull();
    });

    it('an alias equal to the shared name is stored as NULL, not frozen', async () => {
      const customer = await makeCustomer('+9613100122', 'Same Name', vendorAId);
      await request(server)
        .put(`/api/v1/customers/${customer.id}/display-name`)
        .set(auth(vendorBToken))
        .send({ displayName: 'Same Name' })
        .expect(200);

      const link = await prisma.customerVendor.findUniqueOrThrow({
        where: { customerId_vendorId: { customerId: customer.id, vendorId: vendorBId } },
      });
      expect(link.displayName).toBeNull();

      // …so a later correction by the creator still reaches vendor B.
      await request(server)
        .patch(`/api/v1/customers/${customer.id}`)
        .set(auth(vendorAToken))
        .send({ name: 'Fixed Name' })
        .expect(200);
      const asB = await request(server)
        .get(`/api/v1/customers/${customer.id}`)
        .set(auth(vendorBToken))
        .expect(200);
      expect(asB.body.data.name).toBe('Fixed Name');
    });
  });

  describe('address ownership', () => {
    async function seedOwnedAddress(phone: string, name: string, ownerId: string | null) {
      const customer = await makeCustomer(phone, name, ownerId ?? undefined);
      const address = await prisma.customerAddress.create({
        data: {
          customerId: customer.id,
          label: 'HOME',
          addressText: `${name} street`,
          createdByVendorId: ownerId,
        },
      });
      return { customer, address };
    }

    it('a vendor may edit and archive what they added', async () => {
      const { customer, address } = await seedOwnedAddress('+9613100130', 'Owned A', vendorAId);
      await request(server)
        .patch(`/api/v1/customers/${customer.id}/addresses/${address.id}`)
        .set(auth(vendorAToken))
        .send({ addressText: 'Owned A street, Bldg 1' })
        .expect(200);
      await request(server)
        .post(`/api/v1/customers/${customer.id}/addresses/${address.id}/archive`)
        .set(auth(vendorAToken))
        .expect(204);
    });

    it('403 ADDRESS_NOT_YOURS on another vendor\'s row, left byte-identical', async () => {
      const { customer, address } = await seedOwnedAddress('+9613100131', 'Owned B', vendorBId);

      // Sequential, each request built at the moment it is sent: supertest
      // boots the ephemeral server per request, so pre-building two closes the
      // first one out from under the second.
      const edit = await request(server)
        .patch(`/api/v1/customers/${customer.id}/addresses/${address.id}`)
        .set(auth(vendorAToken))
        .send({ addressText: 'Hijacked' })
        .expect(403);
      const archive = await request(server)
        .post(`/api/v1/customers/${customer.id}/addresses/${address.id}/archive`)
        .set(auth(vendorAToken))
        .expect(403);

      for (const res of [edit, archive]) {
        expect(res.body.error.code).toBe('ADDRESS_NOT_YOURS');
        // 403 explains, and it must NOT name the vendor who owns the row.
        expect(JSON.stringify(res.body)).not.toContain('Vendor B Shop');
      }

      const after = await prisma.customerAddress.findUniqueOrThrow({ where: { id: address.id } });
      expect(after.addressText).toBe('Owned B street');
      expect(after.isArchived).toBe(false);
    });

    it('a platform-owned row is admin-only', async () => {
      const { customer, address } = await seedOwnedAddress('+9613100132', 'Unowned', null);
      await request(server)
        .patch(`/api/v1/customers/${customer.id}/addresses/${address.id}`)
        .set(auth(vendorAToken))
        .send({ addressText: 'Nope' })
        .expect(403);
      await request(server)
        .patch(`/api/v1/customers/${customer.id}/addresses/${address.id}`)
        .set(auth(adminToken))
        .send({ addressText: 'Admin corrected' })
        .expect(200);
    });

    it('"save my version" leaves theirs alone and makes me the owner of mine', async () => {
      const { customer, address } = await seedOwnedAddress('+9613100133', 'Copy Me', vendorBId);

      const res = await request(server)
        .post(`/api/v1/customers/${customer.id}/addresses`)
        .set(auth(vendorAToken))
        .send({ label: 'HOME', addressText: 'Copy Me street, Bldg 7' })
        .expect(201);
      expect(res.body.data.ownership).toBe('MINE');

      const rows = await prisma.customerAddress.findMany({
        where: { customerId: customer.id, isArchived: false },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows).toHaveLength(2);
      expect(rows[0]!.id).toBe(address.id);
      expect(rows[0]!.addressText).toBe('Copy Me street'); // untouched
      expect(rows[0]!.createdByVendorId).toBe(vendorBId);
      expect(rows[1]!.createdByVendorId).toBe(vendorAId);
    });

    it('ownership ships as a verdict, and MINE sorts first', async () => {
      const { customer } = await seedOwnedAddress('+9613100134', 'Sorted', vendorBId);
      await prisma.customerAddress.create({
        data: {
          customerId: customer.id,
          label: 'WORK',
          addressText: 'Mine later',
          createdByVendorId: vendorAId,
        },
      });

      const asA = await request(server)
        .get(`/api/v1/customers/${customer.id}`)
        .set(auth(vendorAToken))
        .expect(200);
      expect(asA.body.data.addresses.map((a: { ownership: string }) => a.ownership)).toEqual([
        'MINE',
        'OTHER',
      ]);
      // A vendor never learns WHO owns the other row, nor any vendor id.
      const blob = JSON.stringify(asA.body);
      expect(blob).not.toContain('Vendor B Shop');
      expect(blob).not.toContain('createdByVendorId');
      expect(blob).not.toContain(vendorBId);

      const asAdmin = await request(server)
        .get(`/api/v1/admin/customers/${customer.id}`)
        .set(auth(adminToken))
        .expect(200);
      const names = asAdmin.body.data.addresses.map(
        (a: { ownerVendorName: string | null }) => a.ownerVendorName,
      );
      expect(names).toContain('Vendor B Shop');
    });
  });

  describe('admin sees the whole relationship', () => {
    it('lists every linked vendor with their counts and the creator badge', async () => {
      const customer = await makeCustomer('+9613100140', 'Well Connected', vendorAId);
      await seedOrder({ vendorId: vendorAId, customerId: customer.id, addressText: 'A st' });
      await seedOrder({ vendorId: vendorBId, customerId: customer.id, addressText: 'B st' });
      await request(server)
        .put(`/api/v1/customers/${customer.id}/display-name`)
        .set(auth(vendorBToken))
        .send({ displayName: 'B’s Name For Them' })
        .expect(200);

      const res = await request(server)
        .get(`/api/v1/admin/customers/${customer.id}`)
        .set(auth(adminToken))
        .expect(200);

      const links: Array<{
        businessName: string;
        isCreator: boolean;
        ordersCount: number;
        displayName: string | null;
      }> = res.body.data.vendorLinks;
      expect(links).toHaveLength(2);
      const a = links.find((l) => l.businessName === 'Vendor A Shop')!;
      const b = links.find((l) => l.businessName === 'Vendor B Shop')!;
      expect(a.isCreator).toBe(true);
      expect(b.isCreator).toBe(false);
      expect(a.ordersCount).toBe(1);
      expect(b.displayName).toBe('B’s Name For Them');

      // A vendor asking the same question gets no link list at all.
      const asA = await request(server)
        .get(`/api/v1/customers/${customer.id}`)
        .set(auth(vendorAToken))
        .expect(200);
      expect(asA.body.data.vendorLinks).toBeUndefined();
    });

    it('admin search matches a partial number in local format', async () => {
      const res = await request(server)
        .get(`/api/v1/admin/customers?q=${encodeURIComponent('03 100 1')}&limit=100`)
        .set(auth(adminToken))
        .expect(200);
      const phones = res.body.data.map((c: { normalizedPhone: string }) => c.normalizedPhone);
      // Admin sees the whole directory, so BOTH vendors' customers come back.
      expect(phones).toContain('+9613100100');
      expect(phones).toContain('+9613100101');
    });

    it('the directory can be narrowed to one vendor\'s customers', async () => {
      const res = await request(server)
        .get(`/api/v1/admin/customers?vendorId=${vendorBId}&limit=100`)
        .set(auth(adminToken))
        .expect(200);
      const phones = res.body.data.map((c: { normalizedPhone: string }) => c.normalizedPhone);
      expect(phones).toContain('+9613100100'); // vendor B created them
      expect(phones).not.toContain('+9613100101'); // vendor A's, never ordered by B
      expect(res.body.data[0]._count.vendorLinks).toBeGreaterThan(0);
    });
  });
});
