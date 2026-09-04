import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthService } from '../../src/auth/auth.service';
import { TokenService } from '../../src/auth/token.service';

/**
 * Admins managing admins.
 *
 * The platform shipped with exactly one admin and no way to make another, so
 * every rule here is new. Two of them are the reason this file exists at all:
 * an admin must not be able to lock themselves out of the console they are
 * standing in, and the platform must never be left without an admin who can
 * sign in — a state whose only cure is shell access to the production box.
 */
describe('admins managing admins (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  let adminId: string;
  let adminToken: string;
  let vendorToken: string;
  let driverToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const PASSWORD = 'password123';

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

    const hash = await AuthService.hashPassword(PASSWORD);
    const admin = await prisma.user.create({
      data: { email: 'root@admins.local', passwordHash: hash, role: 'ADMIN' },
    });
    adminId = admin.id;
    adminToken = tokens.signAccessToken({ sub: admin.id, role: 'ADMIN', tv: 0 });

    const vendorUser = await prisma.user.create({
      data: { email: 'vendor@admins.local', passwordHash: hash, role: 'VENDOR' },
    });
    const vendor = await prisma.vendor.create({
      data: { userId: vendorUser.id, businessName: 'Bystander Shop' },
    });
    vendorToken = tokens.signAccessToken({
      sub: vendorUser.id,
      role: 'VENDOR',
      tv: 0,
      vid: vendor.id,
    });

    const driverUser = await prisma.user.create({
      data: { normalizedPhone: '+96170555111', passwordHash: hash, role: 'DRIVER' },
    });
    const driver = await prisma.driver.create({
      data: { userId: driverUser.id, fullName: 'Bystander Driver', contactPhone: '+96170555111' },
    });
    driverToken = tokens.signAccessToken({
      sub: driverUser.id,
      role: 'DRIVER',
      tv: 0,
      did: driver.id,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  let seq = 0;
  /** A second admin to act ON, so no test depends on another's leftovers. */
  async function makeAdmin(): Promise<{ id: string; email: string; token: string }> {
    seq += 1;
    const email = `extra${seq}@admins.local`;
    const res = await request(server)
      .post('/api/v1/admin/admins')
      .set(auth(adminToken))
      .send({ email, password: PASSWORD })
      .expect(201);
    return {
      id: res.body.data.id,
      email,
      token: tokens.signAccessToken({ sub: res.body.data.id, role: 'ADMIN', tv: 0 }),
    };
  }

  // ------------------------------------------------------------- creating

  it('creates a second admin who can then sign in', async () => {
    const res = await request(server)
      .post('/api/v1/admin/admins')
      .set(auth(adminToken))
      .send({ email: 'second@admins.local', password: PASSWORD })
      .expect(201);

    expect(res.body.data).toMatchObject({ email: 'second@admins.local', isActive: true });
    expect(res.body.data.passwordHash).toBeUndefined();

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: 'second@admins.local', password: PASSWORD })
      .expect(200);
    expect(login.body.data.user.role).toBe('ADMIN');
  });

  it('refuses an email that already belongs to anybody', async () => {
    const res = await request(server)
      .post('/api/v1/admin/admins')
      .set(auth(adminToken))
      .send({ email: 'vendor@admins.local', password: PASSWORD })
      .expect(409);
    expect(res.body.error.message).toMatch(/already exists/i);
  });

  it('records the creation in the audit log', async () => {
    const created = await makeAdmin();
    await new Promise((r) => setTimeout(r, 200)); // audit.log is fire-and-forget
    const entry = await prisma.auditLog.findFirst({
      where: { entityType: 'User', entityId: created.id, action: 'ADMIN_CREATED' },
    });
    expect(entry).not.toBeNull();
    // The email is fine to keep; a password never is.
    expect(JSON.stringify(entry!.metadata)).not.toMatch(/password/i);
  });

  // -------------------------------------------------------------- listing

  it('lists only admins, and finds one by email', async () => {
    const all = await request(server)
      .get('/api/v1/admin/admins?page=1&limit=50')
      .set(auth(adminToken))
      .expect(200);
    const emails = all.body.data.map((a: { email: string }) => a.email);
    expect(emails).toContain('root@admins.local');
    expect(emails).not.toContain('vendor@admins.local'); // a vendor is not an admin
    expect(all.body.meta).toMatchObject({ page: 1, limit: 50 });

    const found = await request(server)
      .get('/api/v1/admin/admins?page=1&limit=20&q=second@')
      .set(auth(adminToken))
      .expect(200);
    expect(found.body.data).toHaveLength(1);
    expect(found.body.data[0].email).toBe('second@admins.local');
  });

  // ----------------------------------------------- resetting a password

  it('resets another admin’s password, ending every session they had', async () => {
    const target = await makeAdmin();

    // They are signed in right now — prove it before we take it away.
    await request(server).get('/api/v1/auth/me').set(auth(target.token)).expect(200);

    await request(server)
      .patch(`/api/v1/admin/admins/${target.id}`)
      .set(auth(adminToken))
      .send({ password: 'brand-new-password' })
      .expect(200);

    // The access token they were holding is dead immediately — not in 15
    // minutes when it would have expired on its own.
    await request(server).get('/api/v1/auth/me').set(auth(target.token)).expect(401);

    await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: target.email, password: PASSWORD })
      .expect(401);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: target.email, password: 'brand-new-password' })
      .expect(200);
  });

  it('lets a LOCKED-OUT admin straight back in, which is the whole point of a reset', async () => {
    const target = await makeAdmin();

    // The state repeated failed sign-ins leave behind. Written directly rather
    // than by looping the login route, because the per-minute throttler would
    // answer 429 before the fifth failure and we would be asserting against the
    // wrong guard entirely.
    await prisma.user.update({
      where: { id: target.id },
      data: { failedLogins: 9, lockedUntil: new Date(Date.now() + 15 * 60_000) },
    });

    // Locked means locked: the CORRECT password is refused too, because the
    // lockout is checked BEFORE the password is verified.
    await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: target.email, password: PASSWORD })
      .expect(423);

    await request(server)
      .patch(`/api/v1/admin/admins/${target.id}`)
      .set(auth(adminToken))
      .send({ password: 'a-brand-new-password' })
      .expect(200);

    // Back in IMMEDIATELY, not in fifteen minutes. Before the reset cleared the
    // lockout this returned 423 and the new password looked broken — which is
    // exactly what happened on production to the owner's own account. The
    // original test for this feature passed because it reset the password of an
    // account that had never been locked, so it walked straight past the gap.
    await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: target.email, password: 'a-brand-new-password' })
      .expect(200);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.failedLogins).toBe(0);
    expect(after.lockedUntil).toBeNull();
  });

  // ------------------------------------------------ suspend / reactivate

  it('suspends another admin, then lets them back in', async () => {
    const target = await makeAdmin();

    await request(server)
      .patch(`/api/v1/admin/admins/${target.id}`)
      .set(auth(adminToken))
      .send({ status: 'SUSPENDED' })
      .expect(200);

    const row = await prisma.user.findUnique({ where: { id: target.id } });
    expect(row!.isActive).toBe(false);

    const refused = await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: target.email, password: PASSWORD })
      .expect(403);
    expect(refused.body.error.code).toBe('ACCOUNT_DEACTIVATED');
    await request(server).get('/api/v1/auth/me').set(auth(target.token)).expect(401);

    await request(server)
      .patch(`/api/v1/admin/admins/${target.id}`)
      .set(auth(adminToken))
      .send({ status: 'ACTIVE' })
      .expect(200);
    await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: target.email, password: PASSWORD })
      .expect(200);
  });

  // ------------------------------------------------------- deleting

  it('deletes another admin and takes their sessions with them', async () => {
    const target = await makeAdmin();
    await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: target.email, password: PASSWORD })
      .expect(200);
    expect(await prisma.refreshToken.count({ where: { userId: target.id } })).toBeGreaterThan(0);

    await request(server)
      .delete(`/api/v1/admin/admins/${target.id}`)
      .set(auth(adminToken))
      .expect(200);

    expect(await prisma.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await prisma.refreshToken.count({ where: { userId: target.id } })).toBe(0);
    await request(server).get('/api/v1/auth/me').set(auth(target.token)).expect(401);
  });

  it('keeps what a deleted admin did — the audit trail has no foreign key to them', async () => {
    const target = await makeAdmin();
    await request(server)
      .delete(`/api/v1/admin/admins/${target.id}`)
      .set(auth(adminToken))
      .expect(200);
    await new Promise((r) => setTimeout(r, 200));

    const created = await prisma.auditLog.findFirst({
      where: { entityType: 'User', entityId: target.id, action: 'ADMIN_CREATED' },
    });
    expect(created).not.toBeNull(); // outlives the row it describes
  });

  // ------------------------------------------ the guards this exists for

  it('refuses to let an admin suspend or delete themselves', async () => {
    const suspend = await request(server)
      .patch(`/api/v1/admin/admins/${adminId}`)
      .set(auth(adminToken))
      .send({ status: 'SUSPENDED' })
      .expect(409);
    expect(suspend.body.error.code).toBe('ADMIN_SELF_ACTION');

    const remove = await request(server)
      .delete(`/api/v1/admin/admins/${adminId}`)
      .set(auth(adminToken))
      .expect(409);
    expect(remove.body.error.code).toBe('ADMIN_SELF_ACTION');

    // …and is still there, still able to work.
    await request(server).get('/api/v1/auth/me').set(auth(adminToken)).expect(200);
  });

  it('refuses to remove the LAST admin who can still sign in', async () => {
    // Two admins: the actor, and the only other active one.
    const survivor = await makeAdmin();
    const others = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true, id: { notIn: [adminId, survivor.id] } },
      select: { id: true },
    });
    // Park everyone else so exactly two remain active.
    for (const o of others) {
      await request(server)
        .patch(`/api/v1/admin/admins/${o.id}`)
        .set(auth(adminToken))
        .send({ status: 'SUSPENDED' })
        .expect(200);
    }

    // The survivor deletes the actor — allowed, two were active.
    await request(server)
      .delete(`/api/v1/admin/admins/${adminId}`)
      .set(auth(survivor.token))
      .expect(200);

    // Now the survivor is alone. They cannot be suspended…
    const suspend = await request(server)
      .patch(`/api/v1/admin/admins/${survivor.id}`)
      .set(auth(survivor.token))
      .send({ status: 'SUSPENDED' })
      .expect(409);
    expect(suspend.body.error.code).toBe('ADMIN_SELF_ACTION'); // self-guard fires first

    // …and the database refuses it even when nothing goes through the service.
    await expect(
      prisma.user.update({ where: { id: survivor.id }, data: { isActive: false } }),
    ).rejects.toThrow(/at least one active admin/);
    await expect(prisma.user.delete({ where: { id: survivor.id } })).rejects.toThrow(
      /at least one active admin/,
    );

    // Restore an actor for anything that runs after this.
    const revived = await request(server)
      .post('/api/v1/admin/admins')
      .set(auth(survivor.token))
      .send({ email: 'root2@admins.local', password: PASSWORD })
      .expect(201);
    adminId = revived.body.data.id;
    adminToken = tokens.signAccessToken({ sub: adminId, role: 'ADMIN', tv: 0 });
  });

  // ------------------------------------------------------ authorization

  it('is closed to everybody who is not an admin', async () => {
    for (const token of [vendorToken, driverToken]) {
      await request(server).get('/api/v1/admin/admins').set(auth(token)).expect(403);
      await request(server)
        .post('/api/v1/admin/admins')
        .set(auth(token))
        .send({ email: 'sneak@admins.local', password: PASSWORD })
        .expect(403);
    }
    await request(server).get('/api/v1/admin/admins').expect(401);
    expect(await prisma.user.findFirst({ where: { email: 'sneak@admins.local' } })).toBeNull();
  });

  it('404s for an id that is not an admin', async () => {
    const vendorUser = await prisma.user.findFirst({ where: { role: 'VENDOR' } });
    await request(server)
      .patch(`/api/v1/admin/admins/${vendorUser!.id}`)
      .set(auth(adminToken))
      .send({ status: 'SUSPENDED' })
      .expect(404);
  });
});
