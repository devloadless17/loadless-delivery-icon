import { test } from '@playwright/test';
import { ADMIN, DRIVER1_PHONE, ensureDuty, loginAs, VENDOR } from './helpers';

/**
 * Design-review captures (not assertions) — run with:
 *   pnpm exec playwright test e2e/screenshots.spec.ts
 * Screenshots land in test-results/shots/.
 */
const OUT = 'test-results/shots';

test('capture key screens', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  await page.goto('/login');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/01-login-light.png` });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/02-login-dark.png` });
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await page.emulateMedia({ colorScheme: 'light' });

  await loginAs(page, ADMIN, '/admin');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/03-admin-dashboard.png`, fullPage: true });
  await page.goto('/admin/orders');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/04-admin-orders.png` });
  await page.goto('/admin/customers');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/05-admin-customers.png` });
  await ctx.close();

  const vendorCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const vendor = await vendorCtx.newPage();
  await loginAs(vendor, VENDOR, '/vendor');
  await vendor.waitForTimeout(600);
  await vendor.screenshot({ path: `${OUT}/06-vendor-orders.png` });
  await vendor.goto('/vendor/orders/new');
  await vendor.waitForTimeout(500);
  await vendor.screenshot({ path: `${OUT}/07-vendor-new-order.png`, fullPage: true });
  await vendorCtx.close();

  const driverCtx = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone-ish
  });
  const driver = await driverCtx.newPage();
  await loginAs(driver, DRIVER1_PHONE, '/driver');
  await ensureDuty(driver, true);
  await driver.waitForTimeout(600);
  await driver.emulateMedia({ colorScheme: 'dark' });
  await driver.evaluate(() => document.documentElement.classList.add('dark'));
  await driver.waitForTimeout(300);
  await driver.screenshot({ path: `${OUT}/08-driver-feed-dark.png` });
  await driver.goto('/driver/earnings');
  await driver.waitForTimeout(500);
  await driver.screenshot({ path: `${OUT}/09-driver-earnings-dark.png` });
  await driverCtx.close();
});
