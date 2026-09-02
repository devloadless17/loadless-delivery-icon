import { expect, test } from '@playwright/test';
import {
  SKIP_REASON,
  ADMIN_PASSWORD,
  DRIVER_A_PHONE,
  DRIVER_B_PHONE,
  PASSWORD,
  STAMP,
  VENDOR_A_EMAIL,
  VENDOR_B_EMAIL,
  asAdmin,
  displayedPhone,
} from './helpers';

test.skip(!!SKIP_REASON, SKIP_REASON);
test.describe.configure({ mode: 'serial', retries: 0 });

/**
 * Admin management against production. Creates two vendors and two drivers,
 * all stamped, which the later specs trade with. Deliberately does NOT open
 * the settings page: changing the platform commission would re-price every
 * order created afterwards, and putting it back does not undo that.
 */
test.describe('production: admin management', () => {
  test('the dashboard renders live platform figures', async ({ page }) => {
    await asAdmin(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Open orders')).toBeVisible();
  });

  test('every admin section loads', async ({ page }) => {
    await asAdmin(page);
    for (const [path, heading] of [
      ['/admin/orders', 'Orders'],
      ['/admin/vendors', 'Vendors'],
      ['/admin/drivers', 'Drivers'],
      ['/admin/customers', 'Customers'],
      ['/admin/settlements', 'Settlements'],
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
  });

  test('admin creates two vendors', async ({ page }) => {
    await asAdmin(page);
    for (const [name, email] of [
      [`${STAMP} Burger`, VENDOR_A_EMAIL],
      [`${STAMP} Falafel`, VENDOR_B_EMAIL],
    ] as const) {
      await page.goto('/admin/vendors');
      await page.getByRole('button', { name: 'New vendor' }).first().click();
      const d = page.getByRole('dialog');
      await d.getByLabel('Business name').fill(name);
      await d.getByLabel('Login email').fill(email);
      await d.getByLabel('Password', { exact: true }).fill(PASSWORD);
      await d.getByRole('button', { name: /Create|Save/ }).click();
      await expect(page.getByText(name)).toBeVisible();
    }
  });

  test('admin creates two drivers, one on a negotiated rate', async ({ page }) => {
    await asAdmin(page);

    await page.goto('/admin/drivers');
    await page.getByRole('button', { name: 'New driver' }).first().click();
    let d = page.getByRole('dialog');
    await d.getByLabel('Full name').fill(`${STAMP} Driver A`);
    await d.getByLabel('Login phone').fill(DRIVER_A_PHONE);
    await d.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await d.getByLabel('Commission override (%)').fill('25');
    await d.getByRole('button', { name: /Create|Save/ }).click();
    await expect(page.getByText(`${STAMP} Driver A`)).toBeVisible();
    // The negotiated rate is shown, not the platform default.
    await expect(page.getByRole('row', { name: new RegExp(`${STAMP} Driver A`) })).toContainText('25');

    await page.goto('/admin/drivers');
    await page.getByRole('button', { name: 'New driver' }).first().click();
    d = page.getByRole('dialog');
    await d.getByLabel('Full name').fill(`${STAMP} Driver B`);
    await d.getByLabel('Login phone').fill(DRIVER_B_PHONE);
    await d.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await d.getByRole('button', { name: /Create|Save/ }).click();
    await expect(page.getByText(`${STAMP} Driver B`)).toBeVisible();
  });

  test('a driver is findable by the phone number the table displays', async ({ page }) => {
    // The bug found in audit: both phone columns store E.164, so a hand-stripped
    // "03 123 456" matched nothing. Typing what is on screen must work.
    await asAdmin(page);
    for (const typed of [displayedPhone(DRIVER_A_PHONE), DRIVER_A_PHONE]) {
      await page.goto(`/admin/drivers?q=${encodeURIComponent(typed)}`);
      await expect(page.getByText(`${STAMP} Driver A`)).toBeVisible();
    }
    await page.goto('/admin/drivers');
    await page.getByPlaceholder(/Search/).fill(`${STAMP} Driver A`);
    await expect(page.getByText(`${STAMP} Driver A`)).toBeVisible();
  });
});
