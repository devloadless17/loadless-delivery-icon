import { expect, test, type Page } from '@playwright/test';

const OUT = 'audit/shots';
const PASSWORD = 'loadless';

async function login(page: Page, identifier: string, home: string) {
  // Login is rate limited (5/min); space the three roles out.
  await page.waitForTimeout(2000);
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(identifier);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`**${home}`);
}

async function shoot(page: Page, name: string, path: string, dark = false) {
  await page.goto(path).catch(() => {});
  // Dev compiles on demand; wait for the page to settle or a 1.1s shot catches
  // skeletons and un-hydrated widgets and looks like a design defect.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(dark ? 350 : 0);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  if (dark) await page.evaluate(() => document.documentElement.classList.remove('dark'));
}

test('sweep', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const admin = await ctx.newPage();
  await login(admin, 'admin@gmail.com', '/admin');
  for (const [name, path] of [
    ['admin-dashboard', '/admin'],
    ['admin-orders', '/admin/orders'],
    ['admin-customers', '/admin/customers'],
    ['admin-vendors', '/admin/vendors'],
    ['admin-drivers', '/admin/drivers'],
    ['admin-reports', '/admin/reports'],
    ['admin-settings', '/admin/settings'],
  ] as const) {
    await shoot(admin, name, path);
  }
  await shoot(admin, 'admin-orders-dark', '/admin/orders', true);
  await ctx.close();

  const v = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const vendor = await v.newPage();
  await login(vendor, 'vendor@gmail.com', '/vendor');
  for (const [name, path] of [
    ['vendor-orders', '/vendor'],
    ['vendor-new-order', '/vendor/orders/new'],
    ['vendor-customers', '/vendor/customers'],
    ['vendor-stats', '/vendor/stats'],
  ] as const) {
    await shoot(vendor, name, path);
  }
  await shoot(vendor, 'vendor-stats-dark', '/vendor/stats', true);
  await v.close();

  const d = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const driver = await d.newPage();
  await login(driver, '70 123 456', '/driver');
  const duty = driver.getByRole('switch').first();
  await expect(duty).toBeVisible();
  if ((await duty.getAttribute('aria-checked')) !== 'true') await duty.click();
  for (const [name, path] of [
    ['driver-feed', '/driver'],
    ['driver-active', '/driver/active'],
    ['driver-history', '/driver/history'],
    ['driver-earnings', '/driver/earnings'],
    ['driver-profile', '/driver/profile'],
  ] as const) {
    await shoot(driver, name, path);
  }
  await d.close();
});
