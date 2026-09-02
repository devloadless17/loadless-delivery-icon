import { expect, test, type Browser } from '@playwright/test';
import {
  ADMIN_PASSWORD,
  CUSTOMER_1_PHONE,
  CUSTOMER_2_PHONE,
  DRIVER_A_PHONE,
  PASSWORD,
  STAMP,
  VENDOR_A_EMAIL,
  apiPost,
  asAdmin,
  createOrder,
  ensureDuty,
  login,
} from './helpers';

test.skip(!ADMIN_PASSWORD, 'PROD_ADMIN_PASSWORD not set');
test.describe.configure({ mode: 'serial', retries: 0 });

const owingRow = (page: import('@playwright/test').Page, driver: string) =>
  page
    .getByRole('table', { name: 'Drivers with an open balance' })
    .getByRole('row')
    .filter({ hasText: driver });

const DRIVER_A = `${STAMP} Driver A`;

async function driverPage(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, DRIVER_A_PHONE, PASSWORD, '/driver');
  return { ctx, page };
}

/**
 * The whole money path on production, in both currencies.
 *
 * Driver A is on a negotiated 25%, so every figure below also proves the
 * per-driver rate is the one applied — not the platform default.
 */
test.describe('production: the money path', () => {
  test('a vendor books work in LBP and USD, and the driver delivers both', async ({ browser }) => {
    const vctx = await browser.newContext();
    const vendor = await vctx.newPage();
    await login(vendor, VENDOR_A_EMAIL, PASSWORD, '/vendor');

    const lbp = await createOrder(vendor, {
      customerPhone: CUSTOMER_1_PHONE,
      customerName: `${STAMP} Customer One`,
      charge: '200000',
    });
    const usd = await createOrder(vendor, {
      customerPhone: CUSTOMER_2_PHONE,
      customerName: `${STAMP} Customer Two`,
      charge: '20.00',
      currency: 'USD',
    });
    await expect(vendor.getByText('20.00 USD')).toBeVisible();

    const { ctx, page: driver } = await driverPage(browser);
    await ensureDuty(driver, true);
    for (const id of [lbp.orderId, usd.orderId]) {
      await apiPost(driver, `/driver/orders/${id}/accept`);
      await apiPost(driver, `/driver/orders/${id}/pickup`);
      await apiPost(driver, `/driver/orders/${id}/deliver`);
    }

    // A second accept on a delivered order must be refused, not silently won.
    const again = await driver.request.post(`/api/v1/driver/orders/${lbp.orderId}/accept`);
    expect(again.status()).toBeGreaterThanOrEqual(400);

    await vctx.close();
    await ctx.close();
  });

  test('the driver sees what he owes, itemised, in both currencies', async ({ browser }) => {
    const { ctx, page } = await driverPage(browser);
    await page.goto('/driver/earnings');
    await expect(page.getByText('To hand over')).toBeVisible();

    // 25% of 200,000 LBP and 25% of $20.00 — separate figures, never summed.
    await expect(page.getByText('50,000 LBP').first()).toBeVisible();
    await expect(page.getByText('5.00 USD').first()).toBeVisible();

    const explainers = page.getByText('What is this for?');
    await expect(explainers).toHaveCount(2);
    for (let i = 0; i < 2; i++) await explainers.nth(i).click();
    await expect(page.getByText(/×\s*25%/).first()).toBeVisible();
    await expect(page.getByText('Commission from these')).toHaveCount(2);
    await ctx.close();
  });

  test('the worklist shows both currencies with their own codes', async ({ page }) => {
    await asAdmin(page);
    await page.goto('/admin/settlements');
    const row = owingRow(page, DRIVER_A);
    await expect(row).toBeVisible();
    await expect(row.getByText(/[\d,]+ LBP/)).toBeVisible();
    await expect(row.getByText(/[\d,.]+ USD/)).toBeVisible();
  });

  test('short-paying one currency leaves the other whole', async ({ page }) => {
    await asAdmin(page);
    await page.goto('/admin/settlements');
    await owingRow(page, DRIVER_A).getByRole('button', { name: 'Settle' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Total due')).toHaveCount(2);
    const collected = dialog.getByLabel('Collected');
    await expect(collected).toHaveCount(2);

    await collected.first().fill('10000'); // LBP short of 50,000
    await expect(dialog.getByText(/Short by/)).toHaveCount(1);
    await expect(dialog.getByText('Paid in full')).toHaveCount(1);

    await dialog.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByText(/Settled — STL-\d{4}-\d{6}/)).toBeVisible();
  });

  test('the shortfall carries, and the settled currency is gone', async ({ browser }) => {
    const { ctx, page } = await driverPage(browser);
    await page.goto('/driver/earnings');
    await expect(page.getByText('To hand over')).toBeVisible();
    await expect(page.getByText(/carried over/).first()).toBeVisible();

    // Assert the PAYLOAD rather than the pixels. The page legitimately still
    // shows USD earnings and a USD handover record, so hunting for the string
    // "USD" on screen tested nothing; and scoping by DOM shape is guesswork.
    // What actually has to be true is that USD is no longer OWED.
    const res = await page.request.get('/api/v1/driver/settlements/current');
    expect(res.status()).toBe(200);
    const owed = (await res.json()) as {
      data: {
        clear: boolean;
        lines: Array<{ currency: string; totalDue: string; broughtForward: string }>;
      };
    };
    expect(owed.data.clear).toBe(false);
    expect(owed.data.lines.map((l) => l.currency)).toEqual(['LBP']);

    const lbp = owed.data.lines[0]!;
    // The shortfall carried: 50,000 owed, 10,000 handed over.
    expect(lbp.broughtForward).toBe('40000');
    expect(lbp.totalDue).toBe('40000');
    await ctx.close();
  });

  test('a charge reaches the driver with its reason', async ({ page, browser }) => {
    await asAdmin(page);
    await page.goto('/admin/settlements');
    await owingRow(page, DRIVER_A).getByRole('button', { name: 'Settle' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Add adjustment' }).click();
    await dialog.getByLabel('Amount').fill('5000');
    await dialog.getByLabel('Reason').fill(`${STAMP} lost the thermal bag`);
    await dialog.getByLabel('Collected').fill('45000');
    await dialog.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByText(/Settled — STL-\d{4}-\d{6}/)).toBeVisible();

    const { ctx, page: driver } = await driverPage(browser);
    await driver.goto('/driver/earnings');
    await expect(driver.getByText("You're all settled")).toBeVisible();
    await expect(
      driver.getByText(new RegExp(`Includes an adjustment: ${STAMP} lost the thermal bag`)),
    ).toBeVisible();

    await driver.getByRole('link', { name: /STL-\d{4}-\d{6}/ }).first().click();
    await driver.waitForURL(/\/driver\/settlements\/[a-z0-9]{20,}$/);
    await expect(driver.getByText(`${STAMP} lost the thermal bag`)).toBeVisible();
    await expect(driver.getByText('Added to what you owed')).toBeVisible();
    await expect(driver.getByText('+5,000 LBP')).toBeVisible();
    await ctx.close();
  });

  test('voiding reverses the last handover without erasing it', async ({ page }) => {
    await asAdmin(page);
    await page.goto('/admin/settlements');
    await page.getByRole('link', { name: /STL-\d{4}-\d{6}/ }).first().click();
    await page.waitForURL(/\/admin\/settlements\/[a-z0-9]{20,}$/);

    await page.getByRole('button', { name: 'Void' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Reason').fill(`${STAMP} reversal check`);
    await dialog.getByRole('button', { name: 'Void settlement' }).click();
    await expect(page.getByText('Settlement voided')).toBeVisible();
    await expect(page.getByText('Voided').first()).toBeVisible();
    await expect(page.getByText(`${STAMP} reversal check`)).toBeVisible();

    // The money is owed again.
    await page.goto('/admin/settlements');
    await expect(owingRow(page, DRIVER_A)).toBeVisible();
  });
});
