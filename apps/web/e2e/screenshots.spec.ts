import { test } from '@playwright/test';
import {
  ADMIN,
  createOrderUI,
  CUSTOMER_SEARCH,
  DRIVER1_PHONE,
  ensureDuty,
  loginAs,
  uniquePhone,
  VENDOR,
  VENDOR2,
} from './helpers';

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

  // The customer-360 panel — the mid-call screen.
  const { customerPhone } = await createOrderUI(vendor, { charge: '150000' });
  await vendor.goto('/vendor/customers');
  await vendor.getByPlaceholder(CUSTOMER_SEARCH).fill(customerPhone);
  await vendor.waitForTimeout(900);
  await vendor.screenshot({ path: `${OUT}/10-customer-profile.png`, fullPage: true });
  await vendor.emulateMedia({ colorScheme: 'dark' });
  await vendor.evaluate(() => document.documentElement.classList.add('dark'));
  await vendor.waitForTimeout(300);
  await vendor.screenshot({ path: `${OUT}/11-customer-profile-dark.png`, fullPage: true });
  await vendor.evaluate(() => document.documentElement.classList.remove('dark'));
  await vendor.emulateMedia({ colorScheme: 'light' });

  // "My customers" — the idle state of the same screen, light and dark.
  await vendor.getByPlaceholder(CUSTOMER_SEARCH).fill('');
  await vendor.waitForTimeout(700);
  await vendor.screenshot({ path: `${OUT}/12-my-customers.png`, fullPage: true });
  await vendor.emulateMedia({ colorScheme: 'dark' });
  await vendor.evaluate(() => document.documentElement.classList.add('dark'));
  await vendor.waitForTimeout(300);
  await vendor.screenshot({ path: `${OUT}/13-my-customers-dark.png`, fullPage: true });
  await vendor.evaluate(() => document.documentElement.classList.remove('dark'));
  await vendor.emulateMedia({ colorScheme: 'light' });

  // …and the same list on a phone, which is where a vendor actually stands.
  await vendor.setViewportSize({ width: 390, height: 844 });
  await vendor.waitForTimeout(400);
  await vendor.screenshot({ path: `${OUT}/14-my-customers-390.png`, fullPage: true });
  await vendor.setViewportSize({ width: 1280, height: 900 });

  await vendor.waitForTimeout(600);
  await vendor.goto('/vendor');
  await vendor.waitForTimeout(600);
  await vendor.screenshot({ path: `${OUT}/06-vendor-orders.png` });
  await vendor.goto('/vendor/orders/new');
  await vendor.waitForTimeout(500);
  await vendor.screenshot({ path: `${OUT}/07-vendor-new-order.png`, fullPage: true });

  // A customer vendor 1 owns, so vendor 2's view shows the read-only states.
  const sharedPhone = uniquePhone();
  await vendor.goto('/vendor/customers');
  await vendor.getByPlaceholder(CUSTOMER_SEARCH).fill(sharedPhone);
  await vendor.getByLabel('Name').fill('Nadia Haddad');
  await vendor.getByLabel('Address (optional)').fill('Ashrafieh, Sassine square, Bldg 12');
  await vendor.getByRole('button', { name: 'Create customer' }).click();
  await vendor.waitForTimeout(600);
  await vendorCtx.close();

  const vendor2Ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const vendor2 = await vendor2Ctx.newPage();
  await loginAs(vendor2, VENDOR2, '/vendor');
  await vendor2.goto('/vendor/customers');
  await vendor2.getByPlaceholder(CUSTOMER_SEARCH).fill(sharedPhone);
  await vendor2.waitForTimeout(800);
  await vendor2.screenshot({ path: `${OUT}/15-address-ownership.png`, fullPage: true });
  await vendor2.getByRole('button', { name: 'Edit name' }).click();
  await vendor2.waitForTimeout(300);
  await vendor2.screenshot({ path: `${OUT}/16-name-scope-warning.png`, fullPage: true });
  await vendor2Ctx.close();

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
