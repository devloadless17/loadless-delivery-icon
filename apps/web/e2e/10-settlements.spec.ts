import { expect, test } from '@playwright/test';
import {
  ADMIN,
  DRIVER1_PHONE,
  DRIVER2_PHONE,
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
  // No retries here, deliberately. These tests are serial and each one moves
  // the drivers' money on to the next state, so a retry does not repeat the
  // failure — it runs the same steps against a world the first attempt already
  // changed, and fails somewhere else entirely. That happened in CI today: the
  // real fault was a wiped adjustment, the retry reported a missing
  // "Overpaying by 20,000 LBP" three assertions earlier, and the second,
  // meaningless failure is the one that got read first. One clear failure beats
  // two contradictory ones.
  test.describe.configure({ retries: 0 });

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
    // One card per currency, so these repeat. Assert PRESENCE rather than
    // uniqueness — this handover swept both LBP and USD deliveries.
    await expect(page.getByText('Total due').first()).toBeVisible();
    await expect(page.getByText('Collected').first()).toBeVisible();
    // And the rate is on every row, which is what makes each line checkable.
    await expect(page.getByRole('columnheader', { name: 'Rate' })).toBeVisible();
  });

  test('the driver can open his own receipt for a past handover', async ({ page }) => {
    await loginAs(page, DRIVER1_PHONE, '/driver');
    await page.goto('/driver/earnings');
    // His handovers are newest-first, and the newest collected only carried
    // debt — zero deliveries. The FIRST one is the handover that actually swept
    // his work, so that is the receipt with something to itemise.
    await page.getByRole('link', { name: /STL-\d{4}-\d{6}/ }).last().click();
    await page.waitForURL(/\/driver\/settlements\/[a-z0-9]{20,}$/);

    await expect(page.getByText('Total due').first()).toBeVisible();
    await expect(page.getByText('You paid').first()).toBeVisible();

    // The breakdown is collapsed by default — that is the whole point of it,
    // so a 30-delivery receipt is readable. Open it to reach the deliveries.
    await page.getByText('What is this for?').first().click();
    await expect(page.getByText(/ORD-\d{4}-\d{6}/).first()).toBeVisible();
    // Each row proves its own arithmetic: charge x rate = commission.
    await expect(page.getByText(/×\s*\d+(\.\d+)?%/).first()).toBeVisible();
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

  // ------------------------------------------------------------- edge cases

  test('an adjustment with no reason is refused on the field, not in a toast', async ({
    page,
  }) => {
    // Ali hit this: the reason is required — it is what the driver reads to
    // understand a charge — but an empty one produced a bare "Validation
    // failed" naming no field, so there was no way to know what to fix.
    await loginAs(page, ADMIN, '/admin');
    await page.goto('/admin/settlements');
    await owingRow(page).getByRole('button', { name: 'Settle' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Add adjustment' }).click();
    await dialog.getByLabel('Amount').fill('5000');

    // Reason left empty: named on the field, and the confirm button refuses.
    await expect(dialog.getByText('Say why — the driver sees this')).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Record/ })).toBeDisabled();

    // Filling it in releases the button.
    await dialog.getByLabel('Reason').fill('Lost the thermal bag');
    await expect(dialog.getByText('Say why — the driver sees this')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /Record/ })).toBeEnabled();
  });

  test('a driver who overpays goes into credit and stays settleable', async ({ browser }) => {
    // The worst bug Ali found. An overpayment leaves a NEGATIVE balance; the
    // cash box defaulted to that negative, "-10000" is not a parseable amount,
    // so the field stayed invalid and the confirm button was dead forever with
    // no explanation. Uses the SECOND driver so it cannot disturb the flow
    // above.
    const vendorCtx = await browser.newContext();
    const vendor = await vendorCtx.newPage();
    await loginAs(vendor, VENDOR, '/vendor');
    const { orderId } = await createOrderUI(vendor, { charge: '100000' });

    const driverCtx = await browser.newContext();
    const driver = await driverCtx.newPage();
    await loginAs(driver, DRIVER2_PHONE, '/driver');
    await ensureDuty(driver, true);
    await apiPost(driver, `/driver/orders/${orderId}/accept`);
    await apiPost(driver, `/driver/orders/${orderId}/pickup`);
    await apiPost(driver, `/driver/orders/${orderId}/deliver`);

    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await loginAs(admin, ADMIN, '/admin');
    await admin.goto('/admin/settlements');

    const row = admin
      .getByRole('table', { name: 'Drivers with an open balance' })
      .getByRole('row')
      .filter({ hasText: 'E2E Driver Two' });
    await row.getByRole('button', { name: 'Settle' }).click();

    // 100,000 at the platform's 30% is 30,000 owed. Hand over 50,000.
    const dialog = admin.getByRole('dialog');
    await expect(dialog.getByText('30,000 LBP').first()).toBeVisible();
    await dialog.getByLabel('Collected').fill('50000');
    await expect(dialog.getByText(/Overpaying by 20,000 LBP/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Record overpayment' }).click();
    await expect(admin.getByText(/Settled — STL-\d{4}-\d{6}/)).toBeVisible();

    // The worklist states it as credit, not as a debt with a minus sign.
    await admin.goto('/admin/settlements');
    await expect(row.getByText('20,000 LBP in credit')).toBeVisible();

    // And he is still settleable: the box defaults to zero rather than to an
    // unparseable negative, and the confirm button is alive.
    await row.getByRole('button', { name: 'Settle' }).click();
    await expect(dialog.getByText(/Nothing to collect — 20,000 LBP in credit/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Record/ })).toBeEnabled();
    await expect(dialog.getByText('Record overpayment')).toHaveCount(0);

    // His own phone agrees, and does not tell him to hand over a negative.
    await driver.goto('/driver/earnings');
    await expect(driver.getByText('To hand over')).toHaveCount(0);
    await expect(driver.getByText(/You paid 20,000 LBP too much/)).toBeVisible();

    // Now charge him for something, and check he can find out WHY. The reason
    // has to reach the person paying it, not just the person entering it.
    await admin.goto('/admin/settlements');
    await row.getByRole('button', { name: 'Settle' }).click();
    await dialog.getByRole('button', { name: 'Add adjustment' }).click();
    await dialog.getByLabel('Amount').fill('25000');
    await dialog.getByLabel('Reason').fill('Lost the thermal bag');
    await dialog.getByLabel('Collected').fill('5000');

    // What the admin typed must SURVIVE a background refetch. This query is
    // never cached and the settlement socket events invalidate it, so the
    // preview reloads while the dialog is open — and it used to re-seed the
    // form from the response, wiping the amount, the adjustment and its reason
    // without a word. It cost a CI run before it would have cost a real
    // handover.
    await admin.reload().catch(() => {});
    await admin.goto('/admin/settlements');
    await row.getByRole('button', { name: 'Settle' }).click();
    await dialog.getByRole('button', { name: 'Add adjustment' }).click();
    await dialog.getByLabel('Amount').fill('25000');
    await dialog.getByLabel('Reason').fill('Lost the thermal bag');
    await dialog.getByLabel('Collected').fill('5000');
    await admin.waitForTimeout(1200); // let any in-flight refetch land
    await expect(dialog.getByLabel('Reason')).toHaveValue('Lost the thermal bag');
    await expect(dialog.getByLabel('Amount')).toHaveValue('25000');
    await expect(dialog.getByLabel('Collected')).toHaveValue('5000');
    await dialog.getByRole('button', { name: 'Record payment' }).click();
    await expect(admin.getByText(/Settled — STL-\d{4}-\d{6}/)).toBeVisible();

    // The handover list tells him there IS an adjustment and names it, so he
    // has a reason to open the receipt rather than just seeing a number.
    await driver.goto('/driver/earnings');
    await expect(driver.getByText(/Includes an adjustment: Lost the thermal bag/)).toBeVisible();

    // And the receipt states it in full, with the direction in words and the
    // amount as a magnitude rather than a minus under a positive phrase.
    await driver.getByRole('link', { name: /STL-\d{4}-\d{6}/ }).first().click();
    await driver.waitForURL(/\/driver\/settlements\/[a-z0-9]{20,}$/);
    await expect(driver.getByText('Lost the thermal bag')).toBeVisible();
    await expect(driver.getByText('Added to what you owed')).toBeVisible();
    await expect(driver.getByText('+25,000 LBP')).toBeVisible();

    await vendorCtx.close();
    await driverCtx.close();
    await adminCtx.close();
  });
});
