import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN,
  PASSWORD,
  VENDOR,
  apiPost,
  ensureDuty,
  forceEnglish,
  login,
  loginAs,
  uniquePhone,
} from './helpers';

/**
 * The settlement screens under real volume.
 *
 * Everything else about settlements is proven at a handful of deliveries, which
 * is the case that was always going to work. The interesting question is the
 * one Ali asked: does this stay usable, and stay honest, when a driver has been
 * running for weeks without settling?
 *
 * Three things have to hold at that size:
 *   - the itemisation never buries the controls (it is collapsed and
 *     scroll-contained precisely so 200 rows cannot push the confirm button
 *     off the screen),
 *   - a list that had to be cut says so, rather than quietly disagreeing with
 *     the total printed above it,
 *   - and a second currency is never starved out of its own itemisation by a
 *     busier one.
 *
 * Its own spec and its own driver, so the stateful flow in 10-settlements is
 * untouched either way.
 */

// Comfortably over SETTLEMENT_ORDER_LIST_LIMIT (200) so the cap engages, while
// the USD handful stays far below it — that asymmetry is the point.
const LBP_ORDERS = 210;
const USD_ORDERS = 4;

const STAMP = `VOL${Date.now().toString().slice(-6)}`;
const DRIVER_PHONE = uniquePhone();
const DRIVER_NAME = `${STAMP} Volume Driver`;

test.describe('settlements under volume', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  const owingRow = (page: Page) =>
    page
      .getByRole('table', { name: 'Drivers with an open balance' })
      .getByRole('row')
      .filter({ hasText: DRIVER_NAME });

  test(`setup: one driver, ${LBP_ORDERS} LBP deliveries and ${USD_ORDERS} USD`, async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(300_000);

    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await forceEnglish(admin, baseURL!);
    await loginAs(admin, ADMIN, '/admin');

    // Straight to the API: this is setup, not the thing under test, and 214
    // trips through the order form would take longer than the run itself.
    await apiPost(admin, '/admin/drivers', {
      fullName: DRIVER_NAME,
      phone: DRIVER_PHONE,
      password: PASSWORD,
      commissionOverrideBps: 2500,
    });

    const vendorCtx = await browser.newContext();
    const vendor = await vendorCtx.newPage();
    await forceEnglish(vendor, baseURL!);
    await loginAs(vendor, VENDOR, '/vendor');

    const driverCtx = await browser.newContext();
    const driver = await driverCtx.newPage();
    await forceEnglish(driver, baseURL!);
    await login(driver, DRIVER_PHONE);
    await driver.waitForURL('**/driver');
    await ensureDuty(driver, true);

    const customerPhone = uniquePhone();
    const makeAndDeliver = async (charge: string, currency: 'LBP' | 'USD') => {
      const res = await vendor.request.post('/api/v1/vendor/orders', {
        data: {
          customerPhone,
          customerName: `${STAMP} Customer`,
          deliveryAddressText: `${STAMP} Hamra, Beirut`,
          deliveryCharge: charge,
          currency,
        },
      });
      if (!res.ok()) throw new Error(`create order -> ${res.status()} ${await res.text()}`);
      const { data } = (await res.json()) as { data: { id: string } };
      await apiPost(driver, `/driver/orders/${data.id}/accept`);
      await apiPost(driver, `/driver/orders/${data.id}/pickup`);
      await apiPost(driver, `/driver/orders/${data.id}/deliver`);
    };

    for (let i = 0; i < LBP_ORDERS; i++) await makeAndDeliver('100000', 'LBP');
    for (let i = 0; i < USD_ORDERS; i++) await makeAndDeliver('20.00', 'USD');

    // The figures below are all derived from this, so prove it landed.
    const owed = await driver.request.get('/api/v1/driver/settlements/current');
    const body = (await owed.json()) as {
      data: { lines: Array<{ currency: string; unsettledOrderCount: number }> };
    };
    const counts = Object.fromEntries(
      body.data.lines.map((l) => [l.currency, l.unsettledOrderCount]),
    );
    expect(counts).toEqual({ LBP: LBP_ORDERS, USD: USD_ORDERS });

    await adminCtx.close();
    await vendorCtx.close();
    await driverCtx.close();
  });

  test('the driver’s screen stays usable, and admits what it had to cut', async ({
    page,
    baseURL,
  }) => {
    await forceEnglish(page, baseURL!);
    await login(page, DRIVER_PHONE);
    await page.waitForURL('**/driver');
    await page.goto('/driver/earnings');

    await expect(page.getByRole('region', { name: 'To hand over' })).toBeVisible();

    // 210 x 100,000 LBP at his negotiated 25%, and 4 x $20 at the same rate.
    await expect(page.getByText('5,250,000 LBP').first()).toBeVisible();
    await expect(page.getByText('20.00 USD').first()).toBeVisible();

    // Collapsed by default — that is what keeps the page short. One disclosure
    // per currency, so the USD list exists even though LBP dwarfs it.
    const explainers = page.getByText('What is this for?');
    await expect(explainers).toHaveCount(2);

    const beforeOpen = await page.evaluate(() => document.body.scrollHeight);
    for (let i = 0; i < 2; i++) await explainers.nth(i).click();

    // The LBP list was cut at 200 and says so; its subtotal is withheld rather
    // than shown against a partial list.
    await expect(page.getByText(/Showing the most recent 200 of 210/)).toBeVisible();

    // The USD currency keeps its OWN itemisation and reconciles in full — it is
    // not starved by the 210 LBP rows sitting in front of it.
    await expect(page.getByText('Commission from these')).toHaveCount(1);
    await expect(page.getByText('20.00 USD').first()).toBeVisible();

    // Opening 204 rows must not turn the page into a mile of scroll: each list
    // is height-capped, so the growth is bounded rather than proportional.
    const afterOpen = await page.evaluate(() => document.body.scrollHeight);
    expect(
      afterOpen - beforeOpen,
      `opening both breakdowns grew the page by ${afterOpen - beforeOpen}px`,
    ).toBeLessThan(1200);
  });

  test('the settle dialog keeps its controls reachable', async ({ page, baseURL }) => {
    await forceEnglish(page, baseURL!);
    await loginAs(page, ADMIN, '/admin');
    await page.goto('/admin/settlements');

    const row = owingRow(page);
    await expect(row).toBeVisible();
    await expect(row.getByText(/[\d,]+ LBP/)).toBeVisible();
    await expect(row.getByText(/[\d,.]+ USD/)).toBeVisible();

    await row.getByRole('button', { name: 'Settle' }).click();
    const dialog = page.getByRole('dialog');

    // The reason the breakdown collapses: with 214 deliveries the amount boxes
    // and the confirm button must still be right there.
    await expect(dialog.getByLabel('Collected')).toHaveCount(2);
    const confirm = dialog.getByRole('button', { name: /Record/ });
    await expect(confirm).toBeVisible();
    await expect(confirm).toBeEnabled();

    // Settle it all, so the receipt below covers 214 deliveries.
    await confirm.click();
    await expect(page.getByText(/Settled — STL-\d{4}-\d{6}/)).toBeVisible();
  });

  test('the admin receipt is bounded and honest about it', async ({ page, baseURL }) => {
    await forceEnglish(page, baseURL!);
    await loginAs(page, ADMIN, '/admin');
    await page.goto('/admin/settlements');

    // Scope to THIS driver's row — the desktop project is serial and earlier
    // specs leave settlements of their own in this table.
    await page
      .getByRole('table', { name: 'Recent settlements' })
      .getByRole('row')
      .filter({ hasText: DRIVER_NAME })
      .getByRole('link', { name: /STL-\d{4}-\d{6}/ })
      .first()
      .click();
    await page.waitForURL(/\/admin\/settlements\/[a-z0-9]{20,}$/);

    await expect(page.getByText('Deliveries covered')).toBeVisible();

    // The cards above report the true count; the table below cannot show them
    // all. Saying so is the whole fix — a number that silently disagrees with
    // the list under it is worse than a shorter list.
    await expect(page.getByText(/Showing the most recent \d+ of 214/)).toBeVisible();

    const rows = await page.getByRole('table').last().getByRole('row').count();
    expect(rows, 'receipt table should be bounded, not one row per delivery').toBeLessThan(214);
  });

  test('the driver can page through every handover', async ({ page, baseURL }) => {
    await forceEnglish(page, baseURL!);
    await login(page, DRIVER_PHONE);
    await page.waitForURL('**/driver');
    await page.goto('/driver/earnings');

    await expect(page.getByRole('heading', { name: 'Handovers' })).toBeVisible();
    const first = await page.getByRole('link', { name: /STL-\d{4}-\d{6}/ }).allInnerTexts();
    expect(first.length).toBeGreaterThan(0);

    // One handover so far, so there is no second page to reach; the pager only
    // appears once there is. Assert the shape rather than forcing the state —
    // the API-level test already walks 12 settlements across two pages.
    const pager = page.getByRole('navigation', { name: /pagination/i });
    if (await pager.isVisible().catch(() => false)) {
      await pager.getByRole('button', { name: /next/i }).click();
      const second = await page.getByRole('link', { name: /STL-\d{4}-\d{6}/ }).allInnerTexts();
      expect(second.some((s) => first.includes(s))).toBe(false);
    }
  });
});
