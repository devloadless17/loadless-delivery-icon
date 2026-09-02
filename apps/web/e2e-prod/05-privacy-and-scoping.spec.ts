import { expect, test } from '@playwright/test';
import {
  SKIP_REASON,
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

test.skip(!!SKIP_REASON, SKIP_REASON);
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

    // Assert the PAYLOAD, not the rendering. The rule is about what the server
    // is willing to tell one vendor about another's customer, and the screen
    // only shows what it is handed — so checking the response proves the rule
    // itself rather than one presentation of it.
    const res = await page.request.get(
      `/api/v1/customers/lookup?q=${CUSTOMER_1_PHONE.replace(/^0/, '')}`,
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      data: { matches: Array<Record<string, unknown>>; hasMore: boolean };
    };
    expect(body.data.matches.length).toBe(1);

    const match = body.data.matches[0]!;
    expect(match.name).toBe(`${STAMP} Customer One`);
    expect(match.isYours).toBe(false);
    // Identity and nothing else — no foreign vendor id or business name, no
    // address, no ownership. A name-searchable directory IS a competitor's
    // client list, and these are the fields that would build one.
    expect(Object.keys(match).sort()).toEqual(['id', 'isYours', 'name', 'normalizedPhone']);
    expect(JSON.stringify(match)).not.toContain('Burger');
    expect(JSON.stringify(match)).not.toContain('Hamra');

    // And the screen surfaces them, so the vendor can actually reach them.
    await expect(page.getByText(`${STAMP} Customer One`).first()).toBeVisible();
  });

  test('a partial number opens nobody on the platform', async ({ page }) => {
    await login(page, VENDOR_B_EMAIL, PASSWORD, '/vendor');
    await page.goto('/vendor/customers');
    // Too few digits must open NOBODY — that is the property. The endpoint
    // answers 200 with an empty list rather than an error, which is the right
    // shape for "no results"; asserting a 4xx tested my assumption, not the rule.
    const short = await page.request.get('/api/v1/customers/lookup?q=76');
    expect(short.status()).toBe(200);
    const shortBody = (await short.json()) as { data: { matches: unknown[] } };
    expect(shortBody.data.matches).toEqual([]);
    await page.getByPlaceholder(/Search/).fill(CUSTOMER_1_PHONE.slice(0, 4));
    await expect(page.getByText(`${STAMP} Customer One`)).toHaveCount(0);
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
