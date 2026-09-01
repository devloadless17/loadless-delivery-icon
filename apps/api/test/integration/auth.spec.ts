import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
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
      `TRUNCATE TABLE order_status_history, orders, customer_change_history,
       customer_vendors, customer_addresses, customers, audit_logs, refresh_tokens,
       file_objects, drivers, vendors, users CASCADE`,
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
});
