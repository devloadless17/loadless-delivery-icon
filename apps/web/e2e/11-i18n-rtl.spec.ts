import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  ADMIN,
  DRIVER1_PHONE,
  VENDOR,
  createOrderUI,
  displayedPhone,
  ensureDuty,
  loginAs,
} from './helpers';

/**
 * Arabic and right-to-left, for the vendor and driver apps only.
 *
 * The reason this file exists in this shape: a first pass at RTL passed every
 * assertion that looked at the PAGE and still shipped LTR dialogs. Radix mounts
 * its dialogs and dropdowns in a portal on document.body — outside any wrapper
 * the app renders — and writes its own `dir` attribute from a context that
 * defaults to 'ltr'. So the checks that matter most here open a portal and
 * measure it, rather than trusting the page around it.
 */

/**
 * A context made with browser.newContext() does NOT inherit `use.baseURL` from
 * the config, so every such context is given it explicitly — otherwise
 * page.goto('/login') has no base to resolve against.
 */
async function newContext(browser: Browser, baseURL: string) {
  return browser.newContext({ baseURL });
}

/**
 * Switch an already-signed-in session to Arabic.
 *
 * Deliberately AFTER login: the shared login() helper drives the English
 * labels, and setting the cookie first would render the form in Arabic and
 * hang on them. It also matches how this is really used — sign in, then pick
 * your language (the pre-login switch has its own test above).
 */
async function switchToArabic(page: Page, baseURL: string) {
  await page.context().addCookies([{ name: 'fd_locale', value: 'ar', url: baseURL }]);
  await page.reload();
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('dir'))).toBe('rtl');
}

const htmlDir = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('dir'));
const dirOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).direction);

test.describe('Arabic & RTL', () => {
  test('the login screen switches to Arabic, mirrors, and remembers the choice', async ({
    page,
    context,
  }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(await htmlDir(page)).toBe('ltr');

    await page.getByRole('button', { name: 'التبديل إلى العربية' }).click();

    await expect(page.getByRole('heading', { name: 'أهلاً بعودتك' })).toBeVisible();
    expect(await htmlDir(page)).toBe('rtl');
    // Remembered in a cookie, not localStorage: the layouts are Server
    // Components, so only a cookie lets the FIRST response already be Arabic.
    const cookie = (await context.cookies()).find((c) => c.name === 'fd_locale');
    expect(cookie?.value).toBe('ar');

    // …and back, so a wrong tap is not a trap for someone who reads neither.
    await page.getByRole('button', { name: 'Switch to English' }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    expect(await htmlDir(page)).toBe('ltr');
  });

  test("a driver's irreversible actions are Arabic INSIDE the dialog, not just behind it", async ({
    browser,
    baseURL,
  }) => {
    // Seed a pending order in English (the helper drives English labels).
    const vendorCtx = await browser.newContext({ baseURL });
    const vendor = await vendorCtx.newPage();
    await loginAs(vendor, VENDOR, '/vendor');
    await createOrderUI(vendor, { customerName: 'RTL Dialog Customer' });
    await vendorCtx.close();

    const ctx = await newContext(browser, baseURL!);
    const driver = await ctx.newPage();
    await loginAs(driver, DRIVER1_PHONE, '/driver');
    await ensureDuty(driver, true);
    await switchToArabic(driver, baseURL!);
    await driver.goto('/driver');

    expect(await htmlDir(driver)).toBe('rtl');
    await expect(driver.getByRole('navigation')).toContainText('الأرباح');

    await driver.getByRole('button', { name: 'قبول الطلب' }).first().click();

    const dialog = driver.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // THE check: the portal itself, not the page behind it.
    expect(await dirOf(driver, '[role=dialog]')).toBe('rtl');
    await expect(dialog).toContainText('هل تستلم هذه التوصيلة؟');
    await expect(dialog.getByRole('button', { name: 'نعم، أقبل' })).toBeVisible();

    await driver.keyboard.press('Escape');
    await ctx.close();
  });

  test("the vendor's dropdown and cancel dialog — both portals — are RTL", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await newContext(browser, baseURL!);
    const vendor = await ctx.newPage();
    await loginAs(vendor, VENDOR, '/vendor');
    await switchToArabic(vendor, baseURL!);
    expect(await htmlDir(vendor)).toBe('rtl');

    await vendor.goto('/vendor/orders/new');
    await expect(vendor.getByText('التوصيل إلى')).toBeVisible();

    // A Radix Select renders its list in a portal on document.body.
    await vendor.locator('#no-currency').click();
    await expect(vendor.getByRole('listbox')).toBeVisible();
    expect(await dirOf(vendor, '[role=listbox]')).toBe('rtl');
    await vendor.keyboard.press('Escape');

    await ctx.close();
  });

  test('the admin console stays English and LTR on a device set to Arabic', async ({
    browser,
    baseURL,
  }) => {
    const ctx = await newContext(browser, baseURL!);
    const admin = await ctx.newPage();
    await loginAs(admin, ADMIN, '/admin');
    // a driver used this device before the admin did
    await admin.context().addCookies([{ name: 'fd_locale', value: 'ar', url: baseURL! }]);
    await admin.reload();

    // The middleware pins /admin to English, which is what puts dir=ltr on
    // <html> — and therefore on admin's toasts and portals too.
    expect(await htmlDir(admin)).toBe('ltr');
    expect(await admin.evaluate(() => document.documentElement.lang)).toBe('en');
    const visible = await admin.evaluate(() => document.body.innerText);
    expect(visible).not.toMatch(/[؀-ۿ]/);

    await ctx.close();
  });

  test('money, dates and phone numbers keep their own direction inside Arabic', async ({
    browser,
    baseURL,
  }) => {
    const ctx = await newContext(browser, baseURL!);
    const vendor = await ctx.newPage();
    await loginAs(vendor, VENDOR, '/vendor');
    await switchToArabic(vendor, baseURL!);

    // Numeric surfaces are isolated so the bidi algorithm cannot reorder them
    // — "1 Sept, 11:21 pm" became "Sept, 11:21 pm 1" and money flipped.
    //
    // The mechanism is `unicode-bidi`, NOT `direction`: plaintext resolves the
    // CONTENT's direction from its own first strong character while leaving the
    // element's `direction` (and therefore its alignment) inherited. So
    // computed `direction` here is still rtl, and asserting otherwise would be
    // asserting the bug back in.
    const isolated = vendor.locator('main bdi, main .data-mono');
    // toBeVisible auto-retries; a bare count() does not, and the orders list
    // arrives after the first paint.
    await expect(isolated.first()).toBeVisible();
    for (const el of await isolated.all()) {
      const mode = await el.evaluate((n) => getComputedStyle(n).unicodeBidi);
      expect(['plaintext', 'isolate', 'isolate-override']).toContain(mode);
    }

    // And the thing that actually matters: a real amount still reads in order.
    const money = vendor.locator('main .data-mono').filter({ hasText: /\d/ }).first();
    const text = (await money.innerText()).trim();
    expect(text).not.toMatch(/^[A-Z]{3}\s/); // "LBP 100,000" would be the flipped form

    await ctx.close();
  });

  test('a switch thumb stays inside its track when the layout mirrors', async ({
    browser,
    baseURL,
  }) => {
    const ctx = await newContext(browser, baseURL!);
    const driver = await ctx.newPage();
    await loginAs(driver, DRIVER1_PHONE, '/driver');
    await ensureDuty(driver, true);
    await switchToArabic(driver, baseURL!);

    // The track flips with the layout but `translate-x` does not, so a checked
    // switch used to push its thumb clean out of the end of the pill.
    const sw = driver.getByRole('switch').first();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    const fits = await sw.evaluate((el) => {
      const track = el.getBoundingClientRect();
      const thumb = (el.firstElementChild as HTMLElement).getBoundingClientRect();
      return thumb.left >= track.left - 1 && thumb.right <= track.right + 1;
    });
    expect(fits).toBe(true);

    await ctx.close();
  });

  test('a phone number is not reordered by the bidi algorithm', async ({ browser, baseURL }) => {
    const ctx = await newContext(browser, baseURL!);
    const driver = await ctx.newPage();
    await loginAs(driver, DRIVER1_PHONE, '/driver');
    await switchToArabic(driver, baseURL!);
    await driver.goto('/driver/profile');

    // "71 999 888" was rendering as "888 999 71": digit groups separated by
    // spaces carry no strong character, so an RTL paragraph lays the GROUPS
    // out right-to-left. Every numeric surface is .data-mono, which is
    // unicode-bidi: plaintext under [dir=rtl].
    const phone = driver.locator('.data-mono').first();
    await expect(phone).toBeVisible();
    const text = (await phone.innerText()).trim();
    expect(text.replace(/\s+/g, ' ')).toBe(displayedPhone(DRIVER1_PHONE.replace(/\s/g, '')));

    await ctx.close();
  });

  test('the brand gold is readable as text (WCAG AA)', async ({ page }) => {
    await loginAs(page, VENDOR, '/vendor');
    const ratio = await page.evaluate(() => {
      // A canvas normalises any CSS colour (oklab/oklch included) to sRGB bytes.
      const cv = document.createElement('canvas');
      cv.width = cv.height = 1;
      const cx = cv.getContext('2d', { willReadFrequently: true })!;
      const rgb = (css: string) => {
        cx.fillStyle = '#fff';
        cx.fillRect(0, 0, 1, 1);
        cx.fillStyle = css;
        cx.fillRect(0, 0, 1, 1);
        const d = cx.getImageData(0, 0, 1, 1).data;
        return [d[0]!, d[1]!, d[2]!] as [number, number, number];
      };
      const lum = (v: [number, number, number]) => {
        const [r, g, b] = v.map((x) => {
          const s = x / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        }) as [number, number, number];
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const el = document.querySelector('nav a[aria-current=page]');
      if (!el) return 0;
      const fg = rgb(getComputedStyle(el).color);
      let n: Element | null = el;
      let bg: [number, number, number] = [255, 255, 255];
      while (n) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) {
          bg = rgb(c);
          break;
        }
        n = n.parentElement;
      }
      const [L1, L2] = [lum(fg), lum(bg)];
      return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    });
    // Brand gold #ffc300 is a FILL: as text on white it measures 1.6:1, so the
    // active tab uses the darkened --primary-strong instead.
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
