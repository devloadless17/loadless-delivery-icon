import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  ADMIN,
  createOrderUI,
  DRIVER1_PHONE,
  DRIVER2_PHONE,
  ensureDuty,
  loginAs,
  uniquePhone,
  VENDOR,
} from './helpers';

/**
 * The complete order lifecycle beyond the golden path: form validation edges,
 * USD orders, saved-address chips, the vendor-cannot-cancel rule, release,
 * fail, the two-driver race UX, admin assign/reassign (with recomputed
 * financials), admin cancel, filters and CSV export.
 */

test.describe('order lifecycle', () => {
  let vendorCtx: BrowserContext;
  let driver1Ctx: BrowserContext;
  let vendor: Page;
  let driver1: Page;

  test.beforeAll(async ({ browser }) => {
    vendorCtx = await browser.newContext();
    vendor = await vendorCtx.newPage();
    await loginAs(vendor, VENDOR, '/vendor');

    driver1Ctx = await browser.newContext();
    driver1 = await driver1Ctx.newPage();
    await loginAs(driver1, DRIVER1_PHONE, '/driver');
    await ensureDuty(driver1, true);
  });

  test.afterAll(async () => {
    await vendorCtx.close();
    await driver1Ctx.close();
  });

  test('order form rejects bad input without losing the page', async () => {
    await vendor.goto('/vendor/orders/new');
    const phone = uniquePhone();
    await vendor.getByPlaceholder('Customer phone — 03 123 456').fill(phone);

    // charge invalid
    await vendor.getByLabel('Customer name (new customer)').fill('Edge Case Customer');
    await vendor.getByLabel('Address for THIS order').fill('Somewhere valid, Beirut');
    await vendor.getByLabel('Amount').fill('abc');
    await vendor.getByRole('button', { name: 'Create order' }).click();
    await expect(vendor.getByText('Enter a valid positive amount').first()).toBeVisible();
    expect(vendor.url()).toContain('/orders/new');

    // zero charge
    await vendor.getByLabel('Amount').fill('0');
    await vendor.getByRole('button', { name: 'Create order' }).click();
    await expect(vendor.getByText('Enter a valid positive amount').first()).toBeVisible();
    expect(vendor.url()).toContain('/orders/new');
  });

  test('USD order carries its own currency end to end', async () => {
    const { orderNumber } = await createOrderUI(vendor, { charge: '12.50', currency: 'USD' });
    await expect(vendor.getByText('12.50 USD')).toBeVisible();
    expect(orderNumber).toMatch(/^ORD-/);
  });

  test('saved address becomes a one-tap card on the next order', async () => {
    const phone = uniquePhone();

    // first order: type the address and save it to the customer profile
    await vendor.goto('/vendor/orders/new');
    await vendor.getByPlaceholder('Customer phone — 03 123 456').fill(phone);
    await vendor.getByLabel('Customer name (new customer)').fill('Chip Customer');
    await vendor.getByLabel('Address for THIS order').fill('Jounieh, main highway, Bldg 2');
    await vendor.getByLabel("Also save this address to the customer's profile").click();
    await vendor.getByLabel('Amount').fill('50000');
    await vendor.getByRole('button', { name: 'Create order' }).click();
    await vendor.waitForURL('**/vendor/orders/**');

    // second order for the same phone: the chip is there and prefills
    await vendor.goto('/vendor/orders/new');
    await vendor.getByPlaceholder('Customer phone — 03 123 456').fill(phone);
    await expect(vendor.getByText('Chip Customer')).toBeVisible(); // known customer
    const card = vendor.getByRole('radio', { name: /Jounieh, main highway/ });
    await expect(card).toBeVisible();
    await card.click();
    // A saved address is now confirmed in words rather than dropped into the input.
    await expect(vendor.getByText('Jounieh, main highway, Bldg 2').first()).toBeVisible();
  });

  test('vendor cancels a PENDING order — with a required reason', async () => {
    const { orderNumber } = await createOrderUI(vendor);
    await vendor.getByRole('button', { name: 'Cancel order' }).click();

    const dialog = vendor.getByRole('dialog');
    // reason required
    await dialog.getByRole('button', { name: 'Cancel order' }).click();
    await expect(vendor.getByText('Give a short reason for the cancellation.')).toBeVisible();

    await dialog.getByLabel('Reason').fill('Customer changed their mind');
    await dialog.getByRole('button', { name: 'Cancel order' }).click();
    await expect(vendor.getByText('Order cancelled')).toBeVisible();
    await expect(vendor.getByText('Cancelled').first()).toBeVisible();
    await expect(vendor.getByText('“Customer changed their mind”')).toBeVisible();
    expect(orderNumber).toMatch(/^ORD-/);
  });

  test('THE RULE: once a driver accepts, the vendor cannot cancel', async () => {
    const { orderId } = await createOrderUI(vendor);
    await driver1.request.post(`/api/v1/driver/orders/${orderId}/accept`);

    await vendor.reload();
    await expect(vendor.getByText('Driver assigned').first()).toBeVisible();
    await expect(vendor.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
    await expect(
      vendor.getByText('A driver has this order — contact the platform if it must be cancelled.'),
    ).toBeVisible();
  });

  test('driver releases before pickup; the order returns to the feed', async () => {
    const { orderId } = await createOrderUI(vendor);
    await driver1.request.post(`/api/v1/driver/orders/${orderId}/accept`);

    await driver1.goto(`/driver/orders/${orderId}`);
    await driver1.getByRole('button', { name: /Release it/ }).click();
    const dialog = driver1.getByRole('dialog');
    await dialog.getByLabel('Reason').fill('Bike broke down');
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(driver1.getByText('Order released back to the feed.')).toBeVisible();
    await driver1.waitForURL('**/driver');

    await vendor.reload();
    await expect(vendor.getByText('Waiting for driver').first()).toBeVisible();
  });

  test('driver can mark a picked-up order as failed', async () => {
    const { orderId } = await createOrderUI(vendor);
    await driver1.request.post(`/api/v1/driver/orders/${orderId}/accept`);

    await driver1.goto(`/driver/orders/${orderId}`);
    await driver1.getByRole('button', { name: /Picked up from/ }).click();
    await expect(driver1.getByText('On the way').first()).toBeVisible();

    await driver1.getByRole('button', { name: /Mark as failed/ }).click();
    const dialog = driver1.getByRole('dialog');
    await dialog.getByLabel('Reason').fill('Customer unreachable');
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(driver1.getByText('Marked as failed.')).toBeVisible();

    await vendor.reload();
    await expect(vendor.getByText('Failed').first()).toBeVisible();
  });

  test('the losing driver gets a clean "already taken" — never a broken state', async ({
    browser,
  }) => {
    // driver2 with sockets BLOCKED: stale feed guaranteed, so their accept
    // must lose — this also proves the app degrades safely without realtime.
    const driver2Ctx = await browser.newContext();
    await driver2Ctx.route('**/socket.io/**', (route) => route.abort());
    const driver2 = await driver2Ctx.newPage();
    await loginAs(driver2, DRIVER2_PHONE, '/driver');
    await ensureDuty(driver2, true);

    const { orderId } = await createOrderUI(vendor);
    await driver2.reload(); // stale snapshot now contains the new order
    const card = driver2
      .locator('li')
      .filter({ hasText: 'Badaro, Sami el Solh Ave' })
      .filter({ has: driver2.getByRole('button', { name: 'Accept order' }) })
      .first();
    await expect(card).toBeVisible();

    await driver1.request.post(`/api/v1/driver/orders/${orderId}/accept`); // driver1 wins
    await card.getByRole('button', { name: 'Accept order' }).click();
    await driver2.getByRole('dialog').getByRole('button', { name: 'Yes, accept' }).click();
    await expect(driver2.getByText('That order was just taken.')).toBeVisible();

    await ensureDuty(driver2, false);
    await driver2Ctx.close();
  });

  test('admin assigns, reassigns (split recomputed), and cancels', async ({ browser }) => {
    const { orderId, orderNumber } = await createOrderUI(vendor);

    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await loginAs(admin, ADMIN, '/admin');
    await admin.goto(`/admin/orders/${orderId}`);

    // manual assign to driver2 (off duty — admin bypasses duty)
    await admin.getByRole('button', { name: 'Assign driver' }).click();
    let dialog = admin.getByRole('dialog');
    await dialog.getByRole('combobox').click();
    await admin.getByRole('option', { name: /E2E Driver Two/ }).click();
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(admin.getByText('Driver assigned').first()).toBeVisible();
    await expect(admin.getByText('Commission (30%)')).toBeVisible(); // driver2 = platform default

    // reassign to driver1 — the split is recomputed at 25%
    await admin.getByRole('button', { name: 'Reassign driver' }).click();
    dialog = admin.getByRole('dialog');
    await dialog.getByRole('combobox').click();
    await admin.getByRole('option', { name: /E2E Driver(?! Two)/ }).click();
    await dialog.getByLabel('Reason').fill('Driver two unavailable');
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(admin.getByText(/recomputed/)).toBeVisible();
    await expect(admin.getByText('Commission (25%)')).toBeVisible();

    // driver1 sees it in active deliveries
    await driver1.goto('/driver/active');
    await expect(driver1.getByText(orderNumber)).toBeVisible();

    // admin cancels mid-flight
    await admin.getByRole('button', { name: 'Cancel order' }).click();
    dialog = admin.getByRole('dialog');
    await dialog.getByLabel('Reason').fill('Vendor asked the platform to cancel');
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(admin.getByText('Order cancelled')).toBeVisible();

    // it leaves the driver's active list
    await driver1.goto('/driver/active');
    await expect(driver1.getByText(orderNumber)).toHaveCount(0);

    await adminCtx.close();
  });

  test('the vendor can find an order by date — including today', async () => {
    const { orderNumber } = await createOrderUI(vendor, { charge: '133000' });
    await vendor.goto('/vendor');
    await expect(vendor.getByText(orderNumber)).toBeVisible();

    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const shift = (days: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return iso(d);
    };

    // TODAY as the end of the range must INCLUDE today's orders. A bare date
    // parses as midnight, so without an end-of-day the newest order — the one
    // someone is most likely hunting for — silently vanishes.
    // By id, not label: "To" also matches the theme toggle's
    // aria-label "Switch to dark mode".
    await vendor.locator('#vo-from').fill(shift(-7));
    await vendor.locator('#vo-to').fill(iso(today));
    await expect(vendor.getByText(orderNumber)).toBeVisible();

    // A window that ended yesterday must exclude it.
    await vendor.locator('#vo-to').fill(shift(-1));
    await expect(vendor.getByText(orderNumber)).toHaveCount(0);
    await expect(vendor.getByText('No orders in this date range')).toBeVisible();

    // Clearing brings everything back.
    await vendor.getByRole('button', { name: 'Clear dates' }).first().click();
    await expect(vendor.getByText(orderNumber)).toBeVisible();
  });

  test('admin order filters and CSV export work', async ({ browser }) => {
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await loginAs(admin, ADMIN, '/admin');

    await admin.goto('/admin/orders');
    await expect(admin.getByRole('table')).toBeVisible();

    // filter: only failed orders. The status picker is the FIRST of four now
    // that the board also filters by vendor, driver and currency — a bare
    // combobox lookup matches all of them.
    await admin.getByRole('combobox').first().click();
    await admin.getByRole('option', { name: 'Failed' }).click();
    await expect(admin.getByRole('table')).toBeVisible();
    const badges = admin.getByRole('table').getByText('Failed');
    expect(await badges.count()).toBeGreaterThan(0);

    // Narrow to ONE vendor: the platform board is unreadable otherwise, and
    // the API has accepted vendorId all along — only the screen lacked it.
    await admin.getByRole('combobox').first().click();
    await admin.getByRole('option', { name: 'All statuses' }).click();
    const vendorPicker = admin.getByRole('combobox').nth(1);
    await vendorPicker.click();
    await admin.getByRole('option', { name: 'E2E Burger House' }).click();
    await expect(admin.getByRole('table')).toBeVisible();
    const vendorCells = admin.getByRole('table').getByText('E2E Falafel Corner');
    expect(await vendorCells.count()).toBe(0); // the other shop is filtered out

    // Clearing brings the whole board back.
    await admin.getByRole('button', { name: 'Clear filters' }).click();
    await expect(admin.getByRole('table')).toBeVisible();

    // CSV export streams with the right header
    const res = await admin.request.get('/api/v1/admin/analytics/orders.csv');
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text.startsWith('orderNumber,createdAt,status')).toBe(true);
    expect(text.split('\n').length).toBeGreaterThan(2);

    await adminCtx.close();
  });
});
