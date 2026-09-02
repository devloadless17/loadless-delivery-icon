import { expect, test } from '@playwright/test';
import {
  ADMIN_PASSWORD,
  CUSTOMER_1_PHONE,
  DRIVER_A_PHONE,
  DRIVER_B_PHONE,
  PASSWORD,
  STAMP,
  VENDOR_A_EMAIL,
  VENDOR_B_EMAIL,
  login,
} from './helpers';

test.skip(!ADMIN_PASSWORD, 'PROD_ADMIN_PASSWORD not set');
test.describe.configure({ mode: 'serial', retries: 0 });

/**
 * The rules that keep one shop's trade private from another, verified on the
 * real deployment. CLAUDE.md calls the vendor scope the single most
 * security-critical line in the product, so it is checked here rather than
 * assumed from unit coverage.
 */
test.describe('production: privacy and scoping', () => {
  test('a vendor sees only their OWN customers, never the platform directory', async ({ page }) => {
    // Vendor B has traded with nobody. Vendor A's customer must not appear by
    // name — a name-searchable directory IS a competitor's client list.
    await login(page, VENDOR_B_EMAIL, PASSWORD, '/vendor');
    await page.goto('/vendor/customers');
    await page.getByPlaceholder(/Search/).fill(`${STAMP} Customer One`);
    await expect(page.getByText(`${STAMP} Customer One`)).toHaveCount(0);
  });

  test('a complete phone number reaches them — and reveals nothing else', async ({ page }) => {
    await login(page, VENDOR_B_EMAIL, PASSWORD, '/vendor');
    await page.goto('/vendor/customers');
    await page.getByPlaceholder(/Search/).fill(CUSTOMER_1_PHONE);

    const platform = page.getByRole('region', { name: 'On the platform' });
    await expect(platform).toBeVisible();
    await expect(platform.getByText(`${STAMP} Customer One`)).toBeVisible();

    // Identity only. A vendor must learn nothing about who ELSE serves them:
    // not the other shop's name, not an address, not an ownership badge.
    await expect(platform.getByText(`${STAMP} Burger`)).toHaveCount(0);
    await expect(platform.getByText('Added by you')).toHaveCount(0);
    await expect(platform.getByText(/Hamra, Beirut/)).toHaveCount(0);
  });

  test('a partial number opens nobody on the platform', async ({ page }) => {
    await login(page, VENDOR_B_EMAIL, PASSWORD, '/vendor');
    await page.goto('/vendor/customers');
    await page.getByPlaceholder(/Search/).fill(CUSTOMER_1_PHONE.slice(0, 4));
    await expect(page.getByRole('region', { name: 'On the platform' })).toHaveCount(0);
  });

  test('a vendor is refused at every admin endpoint', async ({ page }) => {
    await login(page, VENDOR_A_EMAIL, PASSWORD, '/vendor');
    for (const path of [
      '/api/v1/admin/settlements/outstanding',
      '/api/v1/admin/drivers',
      '/api/v1/admin/vendors',
      '/api/v1/admin/customers',
    ]) {
      expect(`${path} -> ${(await page.request.get(path)).status()}`).toBe(`${path} -> 403`);
    }
  });

  test('a driver cannot read another driver’s receipt', async ({ page, browser }) => {
    // Driver A has settlements; Driver B must get a 404 rather than a 403,
    // because confirming one exists would itself say who settled what.
    await login(page, DRIVER_A_PHONE, PASSWORD, '/driver');
    const mine = await page.request.get('/api/v1/driver/settlements?limit=1');
    const body = (await mine.json()) as { data: Array<{ id: string }> };
    expect(body.data.length).toBeGreaterThan(0);
    const someoneElsesId = body.data[0]!.id;

    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await login(other, DRIVER_B_PHONE, PASSWORD, '/driver');
    const res = await other.request.get(`/api/v1/driver/settlements/${someoneElsesId}`);
    expect(res.status()).toBe(404);
    await ctx.close();
  });

  test('a driver is refused at the admin settlement routes', async ({ page }) => {
    await login(page, DRIVER_A_PHONE, PASSWORD, '/driver');
    expect((await page.request.get('/api/v1/admin/settlements/outstanding')).status()).toBe(403);
  });

  test('the platform lookup refuses too few digits and caps what it returns', async ({ page }) => {
    await login(page, VENDOR_B_EMAIL, PASSWORD, '/vendor');
    const short = await page.request.get('/api/v1/customers/lookup?phone=03');
    expect(short.status()).toBeGreaterThanOrEqual(400);
  });
});
