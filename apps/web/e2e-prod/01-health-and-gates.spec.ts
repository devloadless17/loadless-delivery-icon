import { expect, test } from '@playwright/test';
import { SKIP_REASON, ADMIN_PASSWORD } from './helpers';

test.skip(!!SKIP_REASON, SKIP_REASON);
test.describe.configure({ mode: 'serial', retries: 0 });

/** The deployment itself: TLS, routing, and every gate that guards money. */
test.describe('production: health and gates', () => {
  test('TLS, health and the app shell', async ({ page, request }) => {
    expect((await request.get('/api/v1/health')).status()).toBe(200);
    expect((await request.get('/manifest.webmanifest')).status()).toBe(200);
    expect((await request.get('/offline')).status()).toBe(200);
    expect(await (await request.get('/manifest.webmanifest')).text()).toContain('Flash Delivery');

    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('every money and customer endpoint refuses an anonymous caller', async ({ request }) => {
    const guarded = [
      '/api/v1/admin/settlements',
      '/api/v1/admin/settlements/outstanding',
      '/api/v1/admin/orders',
      '/api/v1/admin/drivers',
      '/api/v1/admin/vendors',
      '/api/v1/admin/customers',
      '/api/v1/admin/analytics/dashboard',
      '/api/v1/driver/settlements/current',
      '/api/v1/driver/earnings',
      '/api/v1/vendor/orders',
      '/api/v1/customers/lookup?phone=03123456',
      '/api/v1/auth/me',
    ];
    for (const path of guarded) {
      expect(`${path} -> ${(await request.get(path)).status()}`).toBe(`${path} -> 401`);
    }
  });

  test('an unauthenticated visitor is sent to login, whatever they ask for', async ({ page }) => {
    for (const path of ['/admin', '/vendor', '/driver', '/admin/settlements']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
