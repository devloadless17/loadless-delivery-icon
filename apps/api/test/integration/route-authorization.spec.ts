import { Test, type TestingModule } from '@nestjs/testing';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../../src/auth/decorators';

/**
 * Every route, and who is allowed to call it — enumerated from the router
 * rather than from a list someone remembered to update.
 *
 * Authorization here is decided by decorators, which means the failure mode is
 * silence: a new handler with no `@Roles` inherits whatever the controller
 * says, and a `@Public()` left on after debugging looks exactly like a
 * deliberate one. Neither shows up in a review diff as an error, and no
 * existing test would notice.
 *
 * So this asserts the whole surface at once, and — the part that keeps it
 * honest — FAILS WHEN A ROUTE EXISTS THAT THE TABLE DOES NOT NAME. Adding an
 * endpoint therefore forces a deliberate statement about who may reach it.
 * That is the point; if this test is failing because you added a route, write
 * the expectation rather than loosening the check.
 */

type Expectation = 'ADMIN' | 'VENDOR' | 'DRIVER' | 'ADMIN,VENDOR' | 'PUBLIC' | 'ANY_SIGNED_IN';

/**
 * `METHOD path` -> who may call it.
 *
 * PUBLIC        — no authentication at all.
 * ANY_SIGNED_IN — authenticated, role irrelevant, authorised in the service.
 * otherwise     — exactly these roles, per @Roles.
 */
const EXPECTED: Record<string, Expectation> = {
  'DELETE admin/admins/:id': 'ADMIN',
  'DELETE admin/customers/:id': 'ADMIN',
  'DELETE admin/drivers/:id': 'ADMIN',
  'DELETE admin/vendors/:id': 'ADMIN',
  'DELETE customers/:id/display-name': 'ADMIN,VENDOR',
  'GET admin/admins': 'ADMIN',
  'GET admin/admins/:id': 'ADMIN',
  'GET admin/analytics/dashboard': 'ADMIN',
  'GET admin/analytics/drivers': 'ADMIN',
  'GET admin/analytics/orders.csv': 'ADMIN',
  'GET admin/audit-logs': 'ADMIN',
  'GET admin/customers': 'ADMIN',
  'GET admin/customers/:id': 'ADMIN',
  'GET admin/drivers': 'ADMIN',
  'GET admin/drivers/:driverId/settlements/preview': 'ADMIN',
  'GET admin/drivers/:id': 'ADMIN',
  'GET admin/orders': 'ADMIN',
  'GET admin/orders/:id': 'ADMIN',
  'GET admin/settings': 'ADMIN',
  'GET admin/settlements': 'ADMIN',
  'GET admin/settlements/:id': 'ADMIN',
  'GET admin/settlements/outstanding': 'ADMIN',
  'GET admin/vendors': 'ADMIN',
  'GET admin/vendors/:id': 'ADMIN',
  'GET auth/me': 'ANY_SIGNED_IN',
  'GET customers': 'ADMIN,VENDOR',
  'GET customers/:id': 'ADMIN,VENDOR',
  'GET customers/:id/orders': 'ADMIN,VENDOR',
  'GET customers/lookup': 'ADMIN,VENDOR',
  'GET driver/earnings': 'DRIVER',
  'GET driver/orders': 'DRIVER',
  'GET driver/orders/:id': 'DRIVER',
  'GET driver/orders/available': 'DRIVER',
  'GET driver/profile': 'DRIVER',
  'GET driver/settlements': 'DRIVER',
  'GET driver/settlements/:id': 'DRIVER',
  'GET driver/settlements/current': 'DRIVER',
  // Deliberately not role-gated. FilesService.download authorises against the
  // DRIVER ROW, so a vendor may fetch the face of a driver who actually carried
  // an order for them, and a refusal is 404 rather than 403 precisely so the
  // answer does not reveal who drives for whom. Recorded so the absence of
  // @Roles reads as intent rather than an oversight.
  'GET files/:purpose/:filename': 'ANY_SIGNED_IN',
  'GET health': 'PUBLIC',
  'GET vendor/analytics': 'VENDOR',
  'GET vendor/customers': 'VENDOR',
  'GET vendor/orders': 'VENDOR',
  'GET vendor/orders/:id': 'VENDOR',
  'GET vendor/profile': 'VENDOR',
  'PATCH admin/admins/:id': 'ADMIN',
  'PATCH admin/customers/:id': 'ADMIN',
  'PATCH admin/drivers/:id': 'ADMIN',
  'PATCH admin/settings': 'ADMIN',
  'PATCH admin/vendors/:id': 'ADMIN',
  // The three narrowings inside the shared ADMIN+VENDOR controller. RolesGuard
  // resolves getAllAndOverride([handler, class]), so the handler wins: a vendor
  // ADDS a customer or an address, only an admin EDITS one.
  'PATCH customers/:id': 'ADMIN',
  'PATCH customers/:id/addresses/:addressId': 'ADMIN',
  'PATCH driver/duty': 'DRIVER',
  'PATCH vendor/profile': 'VENDOR',
  'POST admin/admins': 'ADMIN',
  'POST admin/drivers': 'ADMIN',
  'POST admin/drivers/:driverId/settlements': 'ADMIN',
  'POST admin/orders/:id/assign': 'ADMIN',
  'POST admin/orders/:id/cancel': 'ADMIN',
  'POST admin/orders/:id/reassign': 'ADMIN',
  'POST admin/settlements/:id/void': 'ADMIN',
  'POST admin/vendors': 'ADMIN',
  'POST auth/change-password': 'ANY_SIGNED_IN',
  'POST auth/login': 'PUBLIC',
  // Public on purpose: a session the API has already refused must still be
  // able to end itself, or the cookies never clear and /login bounces forever.
  'POST auth/logout': 'PUBLIC',
  'POST auth/refresh': 'PUBLIC',
  'POST customers': 'ADMIN,VENDOR',
  'POST customers/:id/addresses': 'ADMIN,VENDOR',
  'POST customers/:id/addresses/:addressId/archive': 'ADMIN',
  'POST driver/orders/:id/accept': 'DRIVER',
  'POST driver/orders/:id/deliver': 'DRIVER',
  'POST driver/orders/:id/fail': 'DRIVER',
  'POST driver/orders/:id/pickup': 'DRIVER',
  'POST driver/orders/:id/release': 'DRIVER',
  'POST files/upload': 'ADMIN,VENDOR',
  'POST vendor/orders': 'VENDOR',
  'POST vendor/orders/:id/cancel': 'VENDOR',
  'PUT customers/:id/display-name': 'ADMIN,VENDOR',
};

const METHOD_NAME: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
};

interface DiscoveredRoute {
  key: string;
  roles: string[] | undefined;
  isPublic: boolean;
}

describe('route authorization matrix', () => {
  let routes: DiscoveredRoute[];
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const discovery = moduleRef.get(DiscoveryService);
    const reflector = moduleRef.get(Reflector);
    const scanner = new MetadataScanner();

    routes = [];
    for (const wrapper of discovery.getControllers()) {
      const { instance, metatype } = wrapper;
      if (!instance || !metatype) continue;
      const basePath = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '').replace(
        /^\/|\/$/g,
        '',
      );
      const prototype = Object.getPrototypeOf(instance) as object;

      for (const methodName of scanner.getAllMethodNames(prototype)) {
        const handler = (prototype as Record<string, unknown>)[methodName] as
          | ((...args: unknown[]) => unknown)
          | undefined;
        if (!handler) continue;
        const httpMethod = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (httpMethod === undefined) continue;

        const sub = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '').replace(
          /^\/|\/$/g,
          '',
        );
        const path = [basePath, sub].filter(Boolean).join('/');
        routes.push({
          key: `${METHOD_NAME[httpMethod] ?? httpMethod} ${path}`,
          // getAllAndOverride([handler, class]) — the same resolution the guard
          // uses, so a method-level narrowing is read the way it is enforced.
          roles: reflector.getAllAndOverride<string[]>(ROLES_KEY, [handler, metatype]),
          isPublic:
            reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, metatype]) === true,
        });
      }
    }
  });

  afterAll(async () => {
    // Without this the module's Prisma and Redis handles keep Jest alive and
    // the run hangs rather than failing.
    await moduleRef.close();
  });

  it('registers at least the routes this table describes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(Object.keys(EXPECTED).length);
  });

  it('has no route the table does not name — add a new endpoint, state who may call it', () => {
    const undocumented = routes.map((r) => r.key).filter((key) => !(key in EXPECTED));
    expect(undocumented).toEqual([]);
  });

  it('has no table entry for a route that no longer exists', () => {
    const live = new Set(routes.map((r) => r.key));
    const stale = Object.keys(EXPECTED).filter((key) => !live.has(key));
    expect(stale).toEqual([]);
  });

  it('gates every route exactly as the table says', () => {
    const wrong: string[] = [];
    for (const route of routes) {
      const expected = EXPECTED[route.key];
      if (!expected) continue; // reported by the test above

      const actual: Expectation = route.isPublic
        ? 'PUBLIC'
        : route.roles && route.roles.length > 0
          ? ([...route.roles].sort().join(',') as Expectation)
          : 'ANY_SIGNED_IN';

      if (actual !== expected) {
        wrong.push(`${route.key}: expected ${expected}, decorators say ${actual}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('never leaves a write route reachable without authentication', () => {
    // A @Public() write is almost always a debugging leftover. The three that
    // are legitimately public are all auth entry points, and they are named.
    const PUBLIC_WRITES_ALLOWED = new Set([
      'POST auth/login',
      'POST auth/refresh',
      'POST auth/logout',
    ]);
    const leaked = routes
      .filter((r) => r.isPublic && !r.key.startsWith('GET '))
      .map((r) => r.key)
      .filter((key) => !PUBLIC_WRITES_ALLOWED.has(key));
    expect(leaked).toEqual([]);
  });
});
