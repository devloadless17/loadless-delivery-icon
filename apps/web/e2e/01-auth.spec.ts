import { expect, test } from '@playwright/test';
import { ADMIN, DRIVER1_PHONE, login, loginAs, PASSWORD, VENDOR } from './helpers';

test.describe('authentication & role routing', () => {
  test('wrong password shows a generic error (no account enumeration)', async ({ page }) => {
    await login(page, VENDOR, 'definitely-wrong');
    await expect(page.getByText('Incorrect phone number or password.')).toBeVisible();

    // Unknown account: SAME message — existence is not leaked.
    await login(page, 'ghost@nowhere.local', 'whatever123');
    await expect(page.getByText('Incorrect phone number or password.')).toBeVisible();
  });

  test('malformed identifier is rejected client-side', async ({ page }) => {
    await login(page, 'not-an-email-or-phone', PASSWORD);
    await expect(page.getByText('Enter a valid email or phone number')).toBeVisible();
    expect(page.url()).toContain('/login');
  });

  test('empty password is rejected', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email or phone number').fill(ADMIN);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('each role lands on its own home and cannot enter other sections', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await loginAs(page, ADMIN, '/admin');
    await page.goto('/vendor'); // wrong section → bounced home
    await page.waitForURL('**/admin');
    await page.goto('/login'); // already signed in → bounced home
    await page.waitForURL('**/admin');
    await ctx.close();

    const vendorCtx = await browser.newContext();
    const vendorPage = await vendorCtx.newPage();
    await loginAs(vendorPage, VENDOR, '/vendor');
    await vendorPage.goto('/driver');
    await vendorPage.waitForURL('**/vendor');
    await vendorCtx.close();
  });

  test('driver signs in with any phone spelling', async ({ page }) => {
    await loginAs(page, '+961 71 999 888', '/driver');
    await expect(page.getByRole('link', { name: 'Earnings' })).toBeVisible();
  });

  test('session survives reload; sign-out locks the app again', async ({ page }) => {
    await loginAs(page, VENDOR, '/vendor');
    await page.reload();
    await expect(page.getByText('E2E Burger House')).toBeVisible(); // still signed in

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/login');
    await page.goto('/vendor'); // protected → back to login
    await page.waitForURL('**/login**');
  });

  test('unauthenticated visitors are always sent to login', async ({ page }) => {
    for (const path of ['/', '/admin', '/vendor', '/driver', '/admin/orders']) {
      await page.goto(path);
      await page.waitForURL('**/login**');
    }
    void DRIVER1_PHONE;
  });

  /**
   * A page that never hydrates must not leak the password into the URL.
   *
   * These forms submit through JS, so their `method` looks decorative — and it
   * is, right up until hydration does not happen. A stale chunk 404 after a
   * redeploy, or a driver on a bad connection timing out on the bundle, and the
   * browser falls back to a NATIVE submit. A <form> with no method defaults to
   * GET, which appends every named field to the query string: the password ends
   * up in the address bar, in history, and in the server access log in plaintext.
   *
   * That is not hypothetical — it was observed in a dev log as
   * `GET /login?identifier=…&password=…` while the server was failing to serve
   * its JS. JavaScript is disabled here to reproduce exactly that state.
   *
   * Dialog forms are not covered because Radix mounts them on interaction, so
   * without JS they never render at all. Any form on a SERVER-RENDERED page is
   * covered, which is what these two contexts walk.
   */
  test('a page that never hydrates cannot leak credentials into the URL', async ({
    browser,
    baseURL,
  }) => {
    const ctx = await browser.newContext({ baseURL, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/login');

    // `form.method` is the RESOLVED method, so it reads 'get' for a form that
    // simply omits the attribute — which is the bug being guarded.
    expect(await page.locator('form').first().evaluate((f: HTMLFormElement) => f.method)).toBe(
      'post',
    );

    await page.getByLabel('Email or phone number').fill(ADMIN);
    await page.getByLabel('Password').fill(PASSWORD);
    const [request] = await Promise.all([
      page.waitForRequest((r) => r.isNavigationRequest() && r.url().includes('/login')),
      page.getByRole('button', { name: 'Sign in' }).click(),
    ]);

    expect(request.method()).toBe('POST');
    expect(request.url()).not.toContain('password');
    expect(page.url()).not.toContain('password');
    await ctx.close();

    // The same fallback reaches the signed-in password form, which carries
    // three secrets. Cookies are borrowed from a real session because the
    // no-JS context cannot sign itself in.
    const signedIn = await browser.newContext({ baseURL });
    const helper = await signedIn.newPage();
    await loginAs(helper, ADMIN, '/admin');
    const cookies = await signedIn.cookies();
    await signedIn.close();

    const noJs = await browser.newContext({ baseURL, javaScriptEnabled: false });
    await noJs.addCookies(cookies);
    const settings = await noJs.newPage();
    await settings.goto('/admin/settings');
    const methods = await settings
      .locator('form')
      .evaluateAll((forms) => forms.map((f) => (f as HTMLFormElement).method));
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.every((m) => m === 'post')).toBe(true);
    await noJs.close();
  });
});
