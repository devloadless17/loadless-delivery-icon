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
    await expect(page.getByText('Enter a valid email or Lebanese phone number')).toBeVisible();
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
});
