import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AuthService } from '../../src/auth/auth.service';

/**
 * Sessions are permanent by product decision: one login per device, never
 * auto-expired. That promise rests entirely on the refresh rotation below, and
 * when it breaks it breaks SILENTLY and fifteen minutes late — the cookie still
 * satisfies the middleware, so the app renders a shell whose every list 401s
 * forever. An empty table, not an error. Hence this file.
 */
describe('auth sessions (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let vendorUserId: string;

  const PASSWORD = 'password123';

  /** The refresh cookie out of a Set-Cookie header list. */
  function refreshCookie(res: request.Response): string {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    const found = (raw ?? []).find((c) => c.startsWith('refresh_token='));
    if (!found) throw new Error('no refresh cookie was set');
    return found.split(';')[0]!;
  }

  /** The access cookie out of a Set-Cookie header list. */
  function accessCookie(res: request.Response): string {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    const found = (raw ?? []).find((c) => c.startsWith('access_token='));
    if (!found) throw new Error('no access cookie was set');
    return found.split(';')[0]!;
  }

  async function login() {
    return request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: 'sessions@test.local', password: PASSWORD })
      .expect(200);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    server = app.getHttpServer();

    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE order_status_history, driver_settlement_lines,
       settlement_adjustments, driver_settlements, driver_balances, orders,
       customer_change_history, customer_vendors, customer_addresses, customers,
       audit_logs, refresh_tokens, file_objects, drivers, vendors, users CASCADE`,
    );
    const hash = await AuthService.hashPassword(PASSWORD);
    const user = await prisma.user.create({
      data: { email: 'sessions@test.local', passwordHash: hash, role: 'VENDOR' },
    });
    await prisma.vendor.create({ data: { userId: user.id, businessName: 'Session Shop' } });
    vendorUserId = user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('refresh returns a WORKING access token, not just a 200', async () => {
    const session = await login();
    const res = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', refreshCookie(session))
      .expect(200);

    // The point of the whole flow: the new cookie actually authenticates.
    const cookies = res.headers['set-cookie'] as unknown as string[];
    const access = cookies.find((c) => c.startsWith('access_token='))!.split(';')[0]!;
    await request(server).get('/api/v1/auth/me').set('Cookie', access).expect(200);
  });

  it('rotates: the presented token is spent and a new one issued', async () => {
    const session = await login();
    const first = refreshCookie(session);

    const res = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', first)
      .expect(200);
    const second = refreshCookie(res);
    expect(second).not.toBe(first);

    // The new one works…
    await request(server).post('/api/v1/auth/refresh').set('Cookie', second).expect(200);
  });

  it('THEFT: two requests presenting the SAME token cannot both rotate', async () => {
    // The thief and the legitimate holder arriving TOGETHER is the case reuse
    // detection exists for, and the one a sequential test cannot reach. The
    // presented row used to be read and then updated unconditionally, so both
    // requests could pass the `usedAt` check and both walk away with a live
    // token, with no reuse ever detected.
    //
    // Firing two requests with Promise.all does not reproduce it — their reads
    // and writes rarely straddle each other, and such a test passes just as
    // happily with the guard removed. So the interleaving is forced: a
    // transaction holds the token's row, both requests get past their read and
    // park on the write, and only then does the holder let go. Both writes then
    // land on a row whose state has already been decided by the other.
    const session = await login();
    const stolen = refreshCookie(session);
    const presented = stolen.split('=')[1]?.split(';')[0] ?? '';
    const tokenHash = createHash('sha256').update(presented).digest('hex');
    const row = await prisma.refreshToken.findFirstOrThrow({
      where: { tokenHash },
      select: { id: true, familyId: true },
    });

    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "refresh_tokens" WHERE "id" = ${row.id} FOR UPDATE`;
        await new Promise((resolve) => setTimeout(resolve, 1200));
      },
      { timeout: 20_000, maxWait: 20_000 },
    );

    await new Promise((resolve) => setTimeout(resolve, 300));
    const [, first, second] = await Promise.all([
      holder,
      request(server).post('/api/v1/auth/refresh').set('Cookie', stolen),
      request(server).post('/api/v1/auth/refresh').set('Cookie', stolen),
    ]);

    // At most one may succeed — a second live token is exactly what would let a
    // thief ride along beside the real user.
    const succeeded = [first, second].filter((r) => r.status === 200);
    expect(succeeded.length).toBeLessThanOrEqual(1);

    const usable = await prisma.refreshToken.count({
      where: { familyId: row.familyId, usedAt: null, revokedAt: null },
    });
    expect(usable).toBeLessThanOrEqual(1);
  });

  it('THEFT: reusing a spent token kills the whole family', async () => {
    const session = await login();
    const first = refreshCookie(session);
    const res = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', first)
      .expect(200);
    const second = refreshCookie(res);

    // Replaying the spent token is the signature of a stolen cookie.
    await request(server).post('/api/v1/auth/refresh').set('Cookie', first).expect(401);

    // …and it takes the thief's token down with it, not just the replayed one.
    await request(server).post('/api/v1/auth/refresh').set('Cookie', second).expect(401);

    // Scoped to THIS family: every login starts its own, and the other
    // sessions in this file must be untouched — revoking one stolen family
    // may not sign the user out of their other devices.
    const spent = await prisma.refreshToken.findFirstOrThrow({
      where: { userId: vendorUserId, usedAt: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    const liveInFamily = await prisma.refreshToken.count({
      where: { familyId: spent.familyId, revokedAt: null, usedAt: null },
    });
    expect(liveInFamily).toBe(0);
    const liveElsewhere = await prisma.refreshToken.count({
      where: { userId: vendorUserId, familyId: { not: spent.familyId }, revokedAt: null },
    });
    expect(liveElsewhere).toBeGreaterThan(0);
  });

  it('a session survives far past the access token — the sliding window', async () => {
    const session = await login();
    let cookie = refreshCookie(session);

    // Ten refreshes: the chain must never break, and each must extend.
    for (let i = 0; i < 10; i += 1) {
      const res = await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(200);
      cookie = refreshCookie(res);
    }

    const newest = await prisma.refreshToken.findFirst({
      where: { userId: vendorUserId, usedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    // Re-extended to the full window each time, never counting down.
    const daysLeft = (newest!.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(daysLeft).toBeGreaterThan(399);
  });

  it('signing out ends it; the old cookie is dead', async () => {
    const session = await login();
    const cookie = refreshCookie(session);
    await request(server).post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
    await request(server).post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('suspension cuts a LIVE session at its next refresh', async () => {
    const session = await login();
    const cookie = refreshCookie(session);

    await prisma.vendor.updateMany({
      where: { userId: vendorUserId },
      data: { status: 'SUSPENDED' },
    });

    const res = await request(server).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DEACTIVATED');

    await prisma.vendor.updateMany({
      where: { userId: vendorUserId },
      data: { status: 'ACTIVE' },
    });
  });

  it('refuses a forged or absent cookie without saying why', async () => {
    await request(server).post('/api/v1/auth/refresh').expect(401);
    await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', 'refresh_token=not-a-real-token')
      .expect(401);
  });

  /**
   * Changing your own password. This exists for the admin the deploy creates
   * from a secret: without it the platform runs forever on a bootstrap value
   * that lives in CI. The properties worth pinning are the security ones.
   */
  describe('changing your own password', () => {
    const NEW_PASSWORD = 'a-much-better-password';

    afterEach(async () => {
      // Put it back so the other tests in this file keep their password.
      await prisma.user.update({
        where: { id: vendorUserId },
        data: { passwordHash: await AuthService.hashPassword(PASSWORD) },
      });
    });

    it('requires the CURRENT password, and says nothing useful when it is wrong', async () => {
      const session = await login();
      const res = await request(server)
        .post('/api/v1/auth/change-password')
        .set('Cookie', accessCookie(session))
        .send({ currentPassword: 'not-the-password', newPassword: NEW_PASSWORD })
        .expect(401);
      // The same generic answer as a bad login: this route is reachable with a
      // stolen session and must not become a way to confirm a password.
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');

      // ...and nothing changed.
      await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: 'sessions@test.local', password: PASSWORD })
        .expect(200);
    });

    it('cannot be reached without a session at all', async () => {
      await request(server)
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(401);
    });

    it('refuses a new password identical to the old one', async () => {
      const session = await login();
      await request(server)
        .post('/api/v1/auth/change-password')
        .set('Cookie', accessCookie(session))
        .send({ currentPassword: PASSWORD, newPassword: PASSWORD })
        .expect(400);
    });

    it('changes it, keeps THIS device signed in, and signs every other one out', async () => {
      const mine = await login();
      const elsewhere = await login(); // a second device, still valid

      const res = await request(server)
        .post('/api/v1/auth/change-password')
        .set('Cookie', accessCookie(mine))
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);

      // This device got fresh cookies and still works.
      await request(server).get('/api/v1/auth/me').set('Cookie', accessCookie(res)).expect(200);

      // The other device's refresh chain is dead — that is what changing a
      // password is FOR.
      await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie(elsewhere))
        .expect(401);

      // The old password no longer works; the new one does.
      await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: 'sessions@test.local', password: PASSWORD })
        .expect(401);
      await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: 'sessions@test.local', password: NEW_PASSWORD })
        .expect(200);
    });

    it('clears a failed-login lockout, so the new password works at once', async () => {
      const mine = await login();

      // What repeated wrong guesses leave behind. Set directly: driving it
      // through the login route would trip the per-minute throttler first and
      // assert against the wrong guard.
      await prisma.user.update({
        where: { id: vendorUserId },
        data: { failedLogins: 9, lockedUntil: new Date(Date.now() + 15 * 60_000) },
      });

      await request(server)
        .post('/api/v1/auth/change-password')
        .set('Cookie', accessCookie(mine))
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);

      // Proving the CURRENT password is a stronger identity check than the
      // lockout defends against, so the lockout must not outlive it. Without
      // this the person changes their password and is still refused for up to
      // fifteen minutes, by a password they no longer have.
      await request(server)
        .post('/api/v1/auth/login')
        .send({ identifier: 'sessions@test.local', password: NEW_PASSWORD })
        .expect(200);

      const after = await prisma.user.findUniqueOrThrow({ where: { id: vendorUserId } });
      expect(after.failedLogins).toBe(0);
      expect(after.lockedUntil).toBeNull();
    });
  });
});
