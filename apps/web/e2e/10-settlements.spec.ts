import { expect, test } from '@playwright/test';
import {
  ADMIN,
  DRIVER1_PHONE,
  VENDOR,
  apiPost,
  createOrderUI,
  ensureDuty,
  loginAs,
} from './helpers';

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
      .getByRole('table', { name: 'Drivers with an open balance' })
      .getByRole('row')
      .filter({ hasText: DRIVER_NAME });

  /**
   * Give the driver a USD delivery on top of the LBP ones the earlier specs
   * produced, so everything below is exercised against a driver who owes in
   * BOTH currencies at once. That is the case the arithmetic must never merge,
   * and the only way to prove it on real screens is to actually create it.
   */
  test('setup: the driver also delivers a USD order', async ({ browser }) => {
    const vendorCtx = await browser.newContext();
    const vendor = await vendorCtx.newPage();
    await loginAs(vendor, VENDOR, '/vendor');
    const { orderId } = await createOrderUI(vendor, { charge: '20.00', currency: 'USD' });

    // Driven through the API rather than the feed: the feed card does not show
    // the order number, so clicking "Accept" there would take whichever card
    // happened to be first and this setup must land on THIS order.
    const driverCtx = await browser.newContext();
    const driver = await driverCtx.newPage();
    await loginAs(driver, DRIVER1_PHONE, '/driver');
    await ensureDuty(driver, true);
    await apiPost(driver, `/driver/orders/${orderId}/accept`);
    await apiPost(driver, `/driver/orders/${orderId}/pickup`);
    await apiPost(driver, `/driver/orders/${orderId}/deliver`);

    // Confirm it really landed, in the UI, before anything below relies on it.
    await driver.goto('/driver/earnings');
    await expect(driver.getByText(/USD/).first()).toBeVisible();

    await vendorCtx.close();
    await driverCtx.close();
  });

  test('admin sees who is holding the platform’s money', async ({ page }) => {
    await loginAs(page, ADMIN, '/admin');
    await page.goto('/admin/settlements');
    await expect(page.getByRole('heading', { name: 'Settlements' })).toBeVisible();

    const row = owingRow(page);
    await expect(row).toBeVisible();
    // Two currencies, two amounts, each carrying its own code — never summed
    // into one number. This is the invariant the whole feature rests on.
    await expect(row.getByText(/[\d,]+ LBP/)).toBeVisible();
    await expect(row.getByText(/[\d,.]+ USD/)).toBeVisible();
  });

  test('the driver can see WHAT he owes for, per currency, before paying', async ({ page }) => {
    // The dispute at the counter. He must be able to answer "why this amount?"
    // himself, on his own phone, BEFORE any cash moves — which is why this runs
    // before the settlement below stamps his deliveries.
    await loginAs(page, DRIVER1_PHONE, '/driver');
    await page.goto('/driver/earnings');
    await expect(page.getByText('To hand over')).toBeVisible();

    // Both currencies are owed, and each gets its OWN figure and its own
    // itemised list. Nothing anywhere adds an LBP amount to a USD one.
    await expect(page.getByText(/[\d,]+ LBP/).first()).toBeVisible();
    await expect(page.getByText(/[\d,.]+ USD/).first()).toBeVisible();

    const explainers = page.getByText('What is this for?');
    await expect(explainers).toHaveCount(2); // one per currency

    for (let i = 0; i < 2; i++) {
      await explainers.nth(i).click();
    }

    // Each delivery shows its own arithmetic: charge x rate = commission.
    await expect(page.getByText(/ORD-\d{4}-\d{6}/).first()).toBeVisible();
    await expect(page.getByText(/×\s*\d+(\.\d+)?%/).first()).toBeVisible();
    // One reconciling subtotal per currency — two lists, never one merged sum.
    await expect(page.getByText('Commission from these')).toHaveCount(2);
  });

  test('a short payment is recorded as such and carried to next time', async ({ page }) => {
    await loginAs(page, ADMIN, '/admin');
    await page.goto('/admin/settlements');

    const row = owingRow(page);
    await row.getByRole('button', { name: 'Settle' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(`Settle with ${DRIVER_NAME}`)).toBeVisible();

    // He owes in BOTH currencies, so there are two independent cards, each with
    // its own sum and its own cash box. Counting them is the assertion: a single
    // merged total would be the bug this whole feature is built to avoid.
    await expect(dialog.getByText('Total due')).toHaveCount(2);
    const collected = dialog.getByLabel('Collected');
    await expect(collected).toHaveCount(2);

    // Short-pay the FIRST currency only, and leave the second at its full
    // default — the two must settle independently of each other.
    await collected.first().fill('1000');
    await expect(dialog.getByText(/Short by/)).toHaveCount(1);
    await expect(dialog.getByText('Paid in full')).toHaveCount(1);

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
    // Only the short-paid currency is left; the other was cleared outright last
    // time and correctly has no card at all now.
    await expect(dialog.getByText('Total due')).toHaveCount(1);
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

  test('the driver can open his own receipt for a past handover', async ({ page }) => {
    await loginAs(page, DRIVER1_PHONE, '/driver');
    await page.goto('/driver/earnings');
    await page.getByRole('link', { name: /STL-\d{4}-\d{6}/ }).first().click();
    await page.waitForURL(/\/driver\/settlements\/[a-z0-9]{20,}$/);

    await expect(page.getByText('Total due')).toBeVisible();
    await expect(page.getByText('You paid')).toBeVisible();
    await expect(page.getByText(/ORD-\d{4}-\d{6}/).first()).toBeVisible();
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
