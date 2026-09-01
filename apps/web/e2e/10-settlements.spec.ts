import { expect, test } from '@playwright/test';
import { ADMIN, DRIVER1_PHONE, loginAs } from './helpers';

/**
 * The end-of-day cash handover.
 *
 * By the time this spec runs the earlier ones have produced real deliveries, so
 * the driver is genuinely holding the platform's commission. The flow under
 * test is the one that happens with two people standing at a counter: the admin
 * reads the figure, the driver hands over what he has, and — the part that
 * matters most — the driver's own phone agrees, both about what he owes and
 * about being clear once he has paid.
 *
 * Runs last: it deliberately settles the drivers the other specs created.
 */
test.describe('driver settlements', () => {
  const DRIVER_NAME = 'E2E Driver';

  /**
   * The row for this driver in the OUTSTANDING table specifically.
   *
   * Scoped on purpose: the history table below lists driver names too, so a
   * bare getByRole('row') matches both and the assertion silently depends on
   * whether the history query has finished loading.
   */
  const owingRow = (page: import('@playwright/test').Page) =>
    page
      .getByRole('table', { name: 'Drivers with money outstanding' })
      .getByRole('row')
      .filter({ hasText: DRIVER_NAME });

  test('admin sees who is holding the platform’s money', async ({ page }) => {
    await loginAs(page, ADMIN, '/admin');
    await page.goto('/admin/settlements');
    await expect(page.getByRole('heading', { name: 'Settlements' })).toBeVisible();

    const row = owingRow(page);
    await expect(row).toBeVisible();
    // The amount is shown per currency with its code — never a bare number.
    await expect(row.getByText(/LBP/)).toBeVisible();
  });

  test('a short payment is recorded as such and carried to next time', async ({ page }) => {
    await loginAs(page, ADMIN, '/admin');
    await page.goto('/admin/settlements');

    const row = owingRow(page);
    await row.getByRole('button', { name: 'Settle' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(`Settle with ${DRIVER_NAME}`)).toBeVisible();
    await expect(dialog.getByText('Total due')).toBeVisible();

    // Hand over far less than is owed.
    const collected = dialog.getByLabel('Collected').first();
    await collected.fill('1000');
    await expect(dialog.getByText(/Short by/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByText(/Settled — STL-\d{4}-\d{6}/)).toBeVisible();
  });

  test('the driver sees the carried debt on his own phone', async ({ page }) => {
    await loginAs(page, DRIVER1_PHONE, '/driver');
    await page.goto('/driver/earnings');

    await expect(page.getByText('To hand over')).toBeVisible();
    // The shortfall from the previous test is carried, and labelled as such.
    await expect(page.getByText(/carried over/).first()).toBeVisible();
    // And he can see the receipt for what he did pay.
    await expect(page.getByRole('heading', { name: 'Handovers' })).toBeVisible();
    await expect(page.getByText(/STL-\d{4}-\d{6}/).first()).toBeVisible();
  });

  test('paying in full clears the driver', async ({ page }) => {
    await loginAs(page, ADMIN, '/admin');
    await page.goto('/admin/settlements');

    const row = owingRow(page);
    await row.getByRole('button', { name: 'Settle' }).click();

    const dialog = page.getByRole('dialog');
    // The box defaults to the full amount owed, carried debt included. This
    // second handover collects only that debt — every delivery was already
    // stamped by the first one — which is exactly the point of carrying it.
    await expect(dialog.getByText('Paid in full')).toBeVisible();
    await dialog.getByRole('button', { name: 'Record payment' }).click();
    await expect(page.getByText(/Settled — STL-\d{4}-\d{6}/)).toBeVisible();

    // He drops off the worklist.
    await expect(owingRow(page)).toHaveCount(0);
  });

  // A separate test rather than a role switch mid-test: the admin's session
  // cookie is still set, and the middleware would bounce /login straight back
  // to /admin. Playwright gives each test a fresh context.
  test('the driver sees that nothing is left on him', async ({ page }) => {
    await loginAs(page, DRIVER1_PHONE, '/driver');
    await page.goto('/driver/earnings');
    await expect(page.getByText("You're all settled")).toBeVisible();
    await expect(page.getByText('To hand over')).toHaveCount(0);
  });

  test('a receipt lists the deliveries it covered', async ({ page }) => {
    await loginAs(page, ADMIN, '/admin');
    await page.goto('/admin/settlements');

    // The list is newest-first, so the LAST link is the first handover — the
    // one that actually swept deliveries.
    await page.getByRole('link', { name: /STL-\d{4}-\d{6}/ }).last().click();
    await page.waitForURL(/\/admin\/settlements\/[a-z0-9]{20,}$/);

    await expect(page.getByText('Deliveries covered')).toBeVisible();
    await expect(page.getByText('Total due')).toBeVisible();
    await expect(page.getByText('Collected')).toBeVisible();
  });

  test('voiding reverses a settlement without erasing it', async ({ page }) => {
    await loginAs(page, ADMIN, '/admin');
    await page.goto('/admin/settlements');

    // Only the most recent settlement may be voided — each one's brought-forward
    // figure is the previous one's shortfall — so open the newest.
    await page.getByRole('link', { name: /STL-\d{4}-\d{6}/ }).first().click();
    await page.waitForURL(/\/admin\/settlements\/[a-z0-9]{20,}$/);

    await page.getByRole('button', { name: 'Void' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Reason').fill('E2E reversal check');
    await dialog.getByRole('button', { name: 'Void settlement' }).click();

    await expect(page.getByText('Settlement voided')).toBeVisible();
    // Nothing is deleted — the record stays, marked, with its reason.
    await expect(page.getByText('Voided').first()).toBeVisible();
    await expect(page.getByText('E2E reversal check')).toBeVisible();

    // And the money is owed again.
    await page.goto('/admin/settlements');
    await expect(owingRow(page)).toBeVisible();
  });
});
