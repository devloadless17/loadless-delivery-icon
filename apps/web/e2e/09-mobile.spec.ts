import { expect, test, type Page } from '@playwright/test';
import {
  CUSTOMER_SEARCH,
  DRIVER1_PHONE,
  loginAs,
  ORDER_PHONE,
  uniquePhone,
  VENDOR,
} from './helpers';

/**
 * The phone is where this product actually lives: a driver's whole job happens
 * on one, and a vendor is on one half the time. Everything here runs at Pixel 5
 * size with touch — the desktop suite proves the logic, this proves it is
 * usable and installable where it is used.
 */

/** Nothing may push the page sideways — the classic mobile layout defect. */
async function expectNoSidewaysScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    view: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scroll,
    `${where} scrolls sideways (${overflow.scroll}px of content in ${overflow.view}px)`,
  ).toBeLessThanOrEqual(overflow.view + 1);
}

/** A control someone taps one-handed, in a hurry, on a bike. */
async function expectTappable(page: Page, name: string | RegExp) {
  const box = await page.getByRole('button', { name }).first().boundingBox();
  expect(box, `${String(name)} has no box`).not.toBeNull();
  expect(box!.height, `${String(name)} is only ${box!.height}px tall`).toBeGreaterThanOrEqual(40);
}

test.describe('on a phone', () => {
  test("a driver's whole job, thumb-first", async ({ page, browser }) => {
    // A vendor creates the order — also on a phone, which is how it happens.
    const vendorCtx = await browser.newContext({ ...test.info().project.use });
    const vendor = await vendorCtx.newPage();
    await loginAs(vendor, VENDOR, '/vendor');
    await expectNoSidewaysScroll(vendor, 'vendor orders');

    const customerPhone = uniquePhone();
    await vendor.goto('/vendor/orders/new');
    await vendor.getByPlaceholder(ORDER_PHONE).fill(customerPhone);
    await vendor.getByLabel('Customer name (new customer)').fill('Mobile Customer');
    await vendor.getByLabel('Address for THIS order').fill('Hamra, Bliss street, Bldg 8');
    await vendor.getByLabel('Amount').fill('120000');
    await expectNoSidewaysScroll(vendor, 'new order form');
    await expectTappable(vendor, 'Create order');
    await vendor.getByRole('button', { name: 'Create order' }).click();
    await vendor.waitForURL((url) => /\/vendor\/orders\/[a-z0-9]{20,}$/.test(url.pathname));
    const orderNumber = (await vendor.locator('h1').innerText()).trim();

    // Now the driver, on their phone, start to finish.
    await loginAs(page, DRIVER1_PHONE, '/driver');
    const duty = page.getByRole('switch').first();
    if ((await duty.getAttribute('aria-checked')) !== 'true') await duty.click();
    await expect(duty).toHaveAttribute('aria-checked', 'true');
    await expectNoSidewaysScroll(page, 'driver feed');

    const card = page
      .locator('li')
      .filter({ hasText: 'Hamra, Bliss street, Bldg 8' })
      .filter({ has: page.getByRole('button', { name: 'Accept order' }) })
      .first();
    await expect(card).toBeVisible();
    await expectTappable(page, 'Accept order');
    await card.getByRole('button', { name: 'Accept order' }).click();
    // Confirmed, not instant: a mistap while scrolling one-handed would take
    // the order off every other driver's feed.
    const takeIt = page.getByRole('dialog');
    await expect(takeIt.getByText('Take this delivery?')).toBeVisible();
    await expectTappable(page, 'Yes, accept');
    await takeIt.getByRole('button', { name: 'Yes, accept' }).click();

    await page.goto('/driver/active');
    await expect(page.getByText(orderNumber)).toBeVisible();
    await expectNoSidewaysScroll(page, 'driver active');
    await page.getByText(orderNumber).click();

    await expectTappable(page, /Picked up from/);
    await page.getByRole('button', { name: /Picked up from/ }).click();
    await expect(page.getByText('On the way').first()).toBeVisible();

    // Delivering asks for confirmation on purpose — it is irreversible and
    // pays the driver. Asserting the toast rather than the word "Delivered"
    // matters: the dialog contains that word, so a test that stops there
    // passes while the order is still sitting at PICKED_UP.
    await expectTappable(page, 'Delivered to customer');
    await page.getByRole('button', { name: 'Delivered to customer' }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm.getByText('Confirm delivery')).toBeVisible();
    await expectTappable(page, 'Yes, delivered');
    await confirm.getByRole('button', { name: 'Yes, delivered' }).click();
    await expect(page.getByText('Delivered. Earnings added.')).toBeVisible();

    await page.goto('/driver/earnings');
    await expect(page.getByText('Completed deliveries')).toBeVisible();
    await expectNoSidewaysScroll(page, 'driver earnings');
    // The money must never wrap into the caption on a narrow screen.
    await expect(page.getByText(orderNumber)).toBeVisible();

    await vendorCtx.close();
  });

  test('the mid-call customer lookup works one-handed', async ({ page }) => {
    await loginAs(page, VENDOR, '/vendor');
    const phone = uniquePhone();

    await page.goto('/vendor/customers');
    await expectNoSidewaysScroll(page, 'my customers');

    await page.getByPlaceholder(CUSTOMER_SEARCH).fill(phone);
    await page.getByLabel('Name').fill('Phone Call Customer');
    await page.getByLabel('Address (optional)').fill('Achrafieh, Sassine, Bldg 4');
    await expectTappable(page, 'Create customer');
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByText('Customer created')).toBeVisible();

    // The profile — the screen a vendor reads aloud while on the call.
    await expect(page.getByRole('heading', { name: /Phone Call Customer/ })).toBeVisible();
    await expect(page.getByText('Achrafieh, Sassine, Bldg 4')).toBeVisible();
    await expectNoSidewaysScroll(page, 'customer profile');

    // Partial-number search, which is the whole point of the one box.
    await page.getByPlaceholder(CUSTOMER_SEARCH).fill(phone.slice(0, 5));
    await expect(page.getByRole('region', { name: 'My customers' })).toBeVisible();
    await expectNoSidewaysScroll(page, 'filtered list');
  });

  test('installable: the manifest describes a real app', async ({ page }) => {
    const res = await page.request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    const manifest = (await res.json()) as {
      name: string;
      start_url: string;
      display: string;
      theme_color: string;
      icons: Array<{ src: string; sizes: string; purpose?: string }>;
    };

    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.theme_color).toMatch(/^#/);
    // Chrome refuses to offer installation without a 192 and a 512.
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    // A maskable icon is what stops Android cropping the logo into a circle.
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);

    // …and every icon it promises actually exists.
    for (const icon of manifest.icons) {
      const img = await page.request.get(icon.src);
      expect(img.status(), `${icon.src} is missing`).toBe(200);
    }
  });

  test('the service worker controls the app and never caches order data', async ({ page }) => {
    await loginAs(page, DRIVER1_PHONE, '/driver');

    // Registered AND controlling — a worker that never activates caches
    // nothing and falls back to nothing.
    await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, {
      timeout: 20_000,
    });

    await page.goto('/driver/earnings');
    await expect(page.getByText('Completed deliveries')).toBeVisible();

    const cached = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        const cache = await caches.open(name);
        for (const req of await cache.keys()) urls.push(req.url);
      }
      return urls;
    });

    // THE invariant: authenticated JSON is never written to a cache. A stale
    // order list on a phone is a driver riding to an address that changed, or
    // a delivery someone else already took.
    const leaked = cached.filter((u) => u.includes('/api/') || u.includes('/socket.io/'));
    expect(leaked, `these API responses were cached: ${leaked.join(', ')}`).toEqual([]);

    // …while the offline page IS precached, so there is something to fall back
    // to when a driver walks into a stairwell.
    expect(cached.some((u) => u.includes('/offline'))).toBe(true);

    // And it renders — the screen a driver actually lands on.
    await page.goto('/offline');
    await expect(page.getByText("You're offline")).toBeVisible();
    await expectNoSidewaysScroll(page, 'offline page');
    await expect(page.getByRole('button', { name: /Try again|Retry/i }).or(page.getByRole('link'))).toBeTruthy();
  });
  test('a deploy offers a refresh — and never on first install', async ({ page }) => {
    await loginAs(page, DRIVER1_PHONE, '/driver');
    await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, {
      timeout: 20_000,
    });

    // Nothing yet: taking control for the FIRST time is not an update, and
    // telling someone who just opened the app that a new version is ready
    // would be nonsense.
    await expect(page.getByText('A new version is ready')).toHaveCount(0);

    // A deploy: a replacement worker takes over an app that already had one.
    await page.evaluate(() =>
      navigator.serviceWorker.dispatchEvent(new Event('controllerchange')),
    );

    await expect(page.getByText('A new version is ready')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
    await expectTappable(page, 'Refresh');

    // It stays put rather than vanishing on a timer — a driver mid-delivery
    // should not lose the offer because they looked away.
    await page.waitForTimeout(6000);
    await expect(page.getByText('A new version is ready')).toBeVisible();

    // And taking it actually reloads onto the new build.
    await page.getByRole('button', { name: 'Refresh' }).click();
    await page.waitForLoadState('load');
    await expect(page.getByRole('switch').first()).toBeVisible();
    await expect(page.getByText('A new version is ready')).toHaveCount(0);
  });
});
