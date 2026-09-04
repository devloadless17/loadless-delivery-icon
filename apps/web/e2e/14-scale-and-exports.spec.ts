import { expect, test } from '@playwright/test';
import { ADMIN, PASSWORD, VENDOR, apiPost, forceEnglish, loginAs, uniquePhone } from './helpers';

/**
 * The screens an operator lives in, once the platform is no longer small.
 *
 * Every defect pinned here was invisible at the size the rest of the suite
 * runs at, which is exactly why it survived: a fixture set of three drivers can
 * never show you that the twenty-first is unreachable, and a report of six rows
 * never shows you that a customer's name is being executed as a formula.
 *
 * Its own spec, its own fixtures, numbered after 13 so the stateful desktop
 * chain in 04–06 and 10–11 is untouched.
 */

const STAMP = `SCL${Date.now().toString().slice(-6)}`;
// Comfortably past the old limit of 20 so the oldest is well outside page one.
const DRIVER_COUNT = 25;
const OLDEST_DRIVER = `${STAMP} Aaliyah Oldest`;

// A name a spreadsheet would evaluate rather than display. This is the payload
// a vendor can type into a customer record, which an admin then opens in Excel.
const HOSTILE_NAME = '=HYPERLINK("http://evil.test","Invoice")';

test.describe('scale, filters and exports', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  test(`setup: ${DRIVER_COUNT} drivers, oldest created first`, async ({ page, baseURL }) => {
    test.setTimeout(180_000);
    await forceEnglish(page, baseURL!);
    await loginAs(page, ADMIN, '/admin');

    // Created FIRST, so a newest-first list of twenty pushes him off the end —
    // he is the driver the old dropdown could not reach.
    await apiPost(page, '/admin/drivers', {
      fullName: OLDEST_DRIVER,
      phone: uniquePhone(),
      password: PASSWORD,
    });
    for (let i = 1; i < DRIVER_COUNT; i++) {
      await apiPost(page, '/admin/drivers', {
        fullName: `${STAMP} Driver ${String(i).padStart(2, '0')}`,
        phone: uniquePhone(),
        password: PASSWORD,
      });
    }

    const res = await page.request.get('/api/v1/admin/drivers?page=1&limit=20');
    const body = (await res.json()) as { meta: { total: number } };
    expect(body.meta.total).toBeGreaterThanOrEqual(DRIVER_COUNT);
  });

  test('the driver hired first can still be assigned an order', async ({ browser, baseURL }) => {
    // A fresh PENDING order to assign.
    const vendorCtx = await browser.newContext();
    const vendor = await vendorCtx.newPage();
    await forceEnglish(vendor, baseURL!);
    await loginAs(vendor, VENDOR, '/vendor');
    const created = await vendor.request.post('/api/v1/vendor/orders', {
      data: {
        customerPhone: uniquePhone(),
        customerName: `${STAMP} Assign Target`,
        deliveryAddressText: `${STAMP} Mar Mikhael`,
        deliveryCharge: '100000',
        currency: 'LBP',
      },
    });
    expect(created.ok()).toBeTruthy();
    const { data: order } = (await created.json()) as { data: { id: string } };
    await vendorCtx.close();

    const page = await browser.newPage();
    await forceEnglish(page, baseURL!);
    await loginAs(page, ADMIN, '/admin');
    await page.goto(`/admin/orders/${order.id}`);

    await page.getByRole('button', { name: 'Assign driver' }).click();
    const dialog = page.getByRole('dialog');

    // The whole point: he is NOT in the first twenty, so the picker has to go
    // and look for him rather than list what it happens to have.
    await dialog.getByRole('combobox').click();
    await dialog.getByRole('combobox').fill('Aaliyah');
    await dialog.getByRole('option', { name: new RegExp(OLDEST_DRIVER) }).click();

    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(OLDEST_DRIVER)).toBeVisible();
    await page.close();
  });

  test('a filter survives a refresh, and narrowing returns to page one', async ({
    page,
    baseURL,
  }) => {
    await forceEnglish(page, baseURL!);
    await loginAs(page, ADMIN, '/admin');
    await page.goto('/admin/drivers');

    await page.getByPlaceholder(/Search/i).fill('Aaliyah');
    await expect(page.getByText(OLDEST_DRIVER)).toBeVisible();
    await expect(page).toHaveURL(/[?&]q=Aaliyah/);

    // The filter used to live in component state alone: a refresh silently
    // returned the full unfiltered list, and the view could not be sent to
    // anyone.
    await page.reload();
    await expect(page.getByText(OLDEST_DRIVER)).toBeVisible();
    await expect(page.getByPlaceholder(/Search/i)).toHaveValue('Aaliyah');

    // Landing straight on a filtered URL works too — that is what makes it
    // shareable rather than merely persistent.
    await page.goto('/admin/drivers?q=Aaliyah');
    await expect(page.getByText(OLDEST_DRIVER)).toBeVisible();

    // Page 2 then a narrower filter must not strand you on a page that no
    // longer exists, showing an empty list that reads as "no matches".
    await page.goto('/admin/drivers?page=2');
    await page.getByPlaceholder(/Search/i).fill('Aaliyah');
    await expect(page).not.toHaveURL(/[?&]page=2/);
    await expect(page.getByText(OLDEST_DRIVER)).toBeVisible();
  });

  test('a failed request says so instead of claiming the list is empty', async ({
    browser,
    baseURL,
  }) => {
    // serviceWorkers: 'block'. The PWA worker re-issues a fetch that page.route
    // never sees, so the first request was faked and the retry sailed past the
    // handler and returned a real 200 — the interception silently did nothing.
    // The worker has no bearing on how a list reports a failure, so the honest
    // way to test this is with the worker out of the picture.
    const context = await browser.newContext({ baseURL, serviceWorkers: 'block' });
    const page = await context.newPage();
    await forceEnglish(page, baseURL!);
    await loginAs(page, ADMIN, '/admin');

    await page.route('**/api/v1/admin/customers**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INTERNAL', message: 'boom' } }),
      }),
    );
    await page.goto('/admin/customers');

    // The old behaviour rendered the empty state here, so an outage was
    // indistinguishable from a client who has no customers at all.
    await expect(page.getByText(/Couldn’t load customers|Couldn't load customers/)).toBeVisible({
      timeout: 15_000, // two retries with backoff before the query gives up
    });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expect(page.getByText('No customers yet')).toHaveCount(0);
    await expect(page.getByRole('table')).toHaveCount(0);
    await context.close();
  });

  test('the customer directory really does list and search', async ({ page, baseURL }) => {
    await forceEnglish(page, baseURL!);
    await loginAs(page, ADMIN, '/admin');
    await page.goto('/admin/customers');

    // By this point in the chain the directory has real rows. 02 can only
    // assert the empty state, so this is where listing and searching are
    // actually proven rather than assumed.
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    const firstCell = await table.getByRole('row').nth(1).getByRole('cell').first().innerText();
    const name = (firstCell.split('\n')[0] ?? '').trim();
    expect(name.length).toBeGreaterThan(0);

    await page.getByPlaceholder(/Search/i).fill(name);
    await expect(table.getByText(name, { exact: false })).not.toHaveCount(0);

    // A search matching nobody must say so, and must not read as a failure.
    await page.getByPlaceholder(/Search/i).fill('zzz-no-such-customer-zzz');
    await expect(page.getByText('No customers match your search')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  });

  test('the export cannot carry a formula, and agrees with the screen', async ({
    page,
    baseURL,
  }) => {
    await forceEnglish(page, baseURL!);
    await loginAs(page, ADMIN, '/admin');

    // A vendor types the customer's name; the admin opens the report.
    const vendorCtx = await page.context().browser()!.newContext();
    const vendor = await vendorCtx.newPage();
    await forceEnglish(vendor, baseURL!);
    await loginAs(vendor, VENDOR, '/vendor');
    const res = await vendor.request.post('/api/v1/vendor/orders', {
      data: {
        customerPhone: uniquePhone(),
        customerName: HOSTILE_NAME,
        deliveryAddressText: `${STAMP} Gemmayze`,
        deliveryCharge: '75000',
        currency: 'LBP',
      },
    });
    expect(res.ok()).toBeTruthy();
    await vendorCtx.close();

    const csv = await page.request.get('/api/v1/admin/analytics/orders.csv');
    expect(csv.status()).toBe(200);
    const text = await csv.text();

    // Present, but disarmed: the cell must not START with = or a spreadsheet
    // evaluates it. Quoting alone never prevented that.
    expect(text).toContain('HYPERLINK');
    expect(text).not.toMatch(/(^|,)"?=/m);
    // Every stored number is E.164, and a bare leading + is arithmetic to Excel.
    expect(text).not.toMatch(/,\+\d/);
  });
});
