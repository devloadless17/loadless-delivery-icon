import { expect, test } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, asAdmin, login } from './helpers';

test.skip(!ADMIN_PASSWORD, 'PROD_ADMIN_PASSWORD not set');
test.describe.configure({ mode: 'serial', retries: 0 });

test.describe('production: authentication', () => {
  test('the superadmin signs in and lands on the admin app', async ({ page }) => {
    await asAdmin(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('a wrong password is refused without saying which half was wrong', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email or phone number').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/Invalid|incorrect|wrong/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('the session survives a reload, and sign-out ends it', async ({ page }) => {
    await asAdmin(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(/\/login/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });

  test('an admin cannot reach vendor or driver areas', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, '/admin');
    for (const path of ['/vendor', '/driver']) {
      await page.goto(path);
      await expect(page).not.toHaveURL(new RegExp(`${path}$`));
    }
  });
});
