import { expect, test } from '@playwright/test';
import { ADMIN_PASSWORD, DRIVER_A_PHONE, PASSWORD, login, expectNoSidewaysScroll } from './helpers';

test.skip(!ADMIN_PASSWORD, 'PROD_ADMIN_PASSWORD not set');
test.describe.configure({ mode: 'serial', retries: 0 });

/** The phone is where the product lives, so the driver's screens are checked
 *  at Pixel 5 size with the densest content actually on screen. */
test.describe('production: on a phone', () => {
  test('the driver’s screens never scroll sideways', async ({ page }) => {
    await login(page, DRIVER_A_PHONE, PASSWORD, '/driver');
    for (const path of ['/driver', '/driver/active', '/driver/earnings', '/driver/profile']) {
      await page.goto(path);
      await expectNoSidewaysScroll(page, path);
    }
  });

  test('the owed breakdown fits the screen with its rows open', async ({ page }) => {
    await login(page, DRIVER_A_PHONE, PASSWORD, '/driver');
    await page.goto('/driver/earnings');
    const explainer = page.getByText('What is this for?').first();
    if (await explainer.isVisible().catch(() => false)) {
      await explainer.click();
      // Order number, date, amount AND "charge x rate" on one line at 393px is
      // the densest layout in the whole driver app.
      await expect(page.getByText(/×\s*\d+(\.\d+)?%/).first()).toBeVisible();
      await expectNoSidewaysScroll(page, 'driver earnings with the breakdown open');
    }
  });

  test('the installable app shell is served', async ({ page, request }) => {
    expect((await request.get('/manifest.webmanifest')).status()).toBe(200);
    await page.goto('/offline');
    await expect(page.locator('body')).toContainText(/offline/i);
  });
});
