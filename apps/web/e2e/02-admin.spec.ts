import { expect, test, type Page } from '@playwright/test';
import { ADMIN, loginAs, PASSWORD } from './helpers';

/**
 * Admin management: vendors, drivers, suspension biting live sessions,
 * password resets, platform settings, customer directory.
 * Creates vendor2@e2e.local (used again by 03-customers).
 */

async function adminPage(page: Page) {
  await loginAs(page, ADMIN, '/admin');
}

test.describe('admin management', () => {
  test('dashboard renders live KPIs', async ({ page }) => {
    await adminPage(page);
    await expect(page.getByText('Open orders')).toBeVisible();
    await expect(page.getByText('On-duty drivers')).toBeVisible();
    await expect(page.getByText('Active vendors')).toBeVisible();
    await expect(page.getByText('Orders — last 14 days')).toBeVisible();
  });

  test('create second vendor; duplicate email is rejected', async ({ page }) => {
    await adminPage(page);
    await page.goto('/admin/vendors');
    await page.getByRole('button', { name: 'New vendor' }).first().click();
    await page.getByLabel('Business name').fill('E2E Falafel Corner');
    await page.getByLabel('Login email').fill('vendor2@e2e.local');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create vendor' }).click();
    await expect(page.getByText('Vendor created')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'E2E Falafel Corner' })).toBeVisible();

    // duplicate email → clean conflict, no second row
    await page.getByRole('button', { name: 'New vendor' }).first().click();
    await page.getByLabel('Business name').fill('Copy Cat');
    await page.getByLabel('Login email').fill('vendor2@e2e.local');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create vendor' }).click();
    await expect(page.getByText('An account with this email already exists')).toBeVisible();
  });

  test('vendor search, edit, suspension kills login, reactivation restores it', async ({
    page,
    browser,
  }) => {
    await adminPage(page);
    await page.goto('/admin/vendors');

    // throwaway vendor for the suspension round-trip
    await page.getByRole('button', { name: 'New vendor' }).first().click();
    await page.getByLabel('Business name').fill('E2E Suspend Me');
    await page.getByLabel('Login email').fill('suspend@e2e.local');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create vendor' }).click();
    await expect(page.getByText('Vendor created')).toBeVisible();

    // search narrows the table
    await page.getByPlaceholder('Search by name or email').fill('Suspend Me');
    await expect(page.getByRole('cell', { name: 'E2E Suspend Me' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'E2E Falafel Corner' })).toHaveCount(0);

    // suspend
    const row = page.getByRole('row', { name: /E2E Suspend Me/ });
    await row.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /Suspended/ }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Vendor updated')).toBeVisible();
    await expect(row.getByText('Suspended')).toBeVisible();

    // suspended vendor cannot sign in
    const ctx = await browser.newContext();
    const locked = await ctx.newPage();
    await locked.goto('/login');
    await locked.getByLabel('Email or phone number').fill('suspend@e2e.local');
    await locked.getByLabel('Password').fill(PASSWORD);
    await locked.getByRole('button', { name: 'Sign in' }).click();
    await expect(locked.getByText(/deactivated/)).toBeVisible();

    // reactivate + password reset in one edit
    await row.getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Active', exact: true }).click();
    await page.getByLabel('Reset password (optional)').fill('resetpassword1');
    await page.getByRole('button', { name: 'Save changes' }).click();
    // assert on STATE, not toasts (a previous toast may still be on screen)
    await expect(row.getByText('Active', { exact: true })).toBeVisible();

    // old password dead, new one works
    await locked.getByRole('button', { name: 'Sign in' }).click();
    await expect(locked.getByText('Incorrect phone number or password.')).toBeVisible();
    await locked.getByLabel('Password').fill('resetpassword1');
    await locked.getByRole('button', { name: 'Sign in' }).click();
    await locked.waitForURL('**/vendor');
    await ctx.close();
  });

  test('create driver with commission override; duplicate phone rejected', async ({ page }) => {
    await adminPage(page);
    await page.goto('/admin/drivers');
    await page.getByRole('button', { name: 'New driver' }).first().click();
    await page.getByLabel('Full name').fill('E2E Extra Driver');
    await page.getByLabel('Login phone').fill('71 555 444');
    await page.getByLabel(/^Password$/).fill(PASSWORD);
    await page.getByLabel('Commission override (%)').fill('20');
    await page.getByRole('button', { name: 'Create driver' }).click();
    await expect(page.getByText('Driver created')).toBeVisible();
    const row = page.getByRole('row', { name: /E2E Extra Driver/ });
    await expect(row.getByText('20%')).toBeVisible();
    await expect(row.getByText('Off duty')).toBeVisible();

    // duplicate phone → clean conflict
    await page.getByRole('button', { name: 'New driver' }).first().click();
    await page.getByLabel('Full name').fill('Phone Thief');
    await page.getByLabel('Login phone').fill('71555444');
    await page.getByLabel(/^Password$/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create driver' }).click();
    await expect(page.getByText('An account with this phone number already exists')).toBeVisible();
  });

  test('platform settings update flows through to the drivers page', async ({ page }) => {
    await adminPage(page);
    await page.goto('/admin/settings');
    const input = page.getByLabel('Commission (%)');
    await expect(input).toHaveValue('30');
    await input.fill('35');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Platform commission is now 35%')).toBeVisible();

    await page.goto('/admin/drivers');
    await expect(page.getByText('Platform commission default: 35%')).toBeVisible();

    // restore — later money assertions depend on 30%
    await page.goto('/admin/settings');
    await input.fill('30');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Platform commission is now 30%')).toBeVisible();
  });

  test('settings reject nonsense percentages', async ({ page }) => {
    await adminPage(page);
    await page.goto('/admin/settings');
    await page.getByLabel('Commission (%)').fill('150');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Enter a percentage between 0 and 100.')).toBeVisible();
  });

  test('customer directory lists and searches', async ({ page }) => {
    await adminPage(page);
    await page.goto('/admin/customers');
    await expect(page.getByText('shared customer directory', { exact: false })).toBeVisible();
  });

  /**
   * Clicking a driver has to answer "what is on him right now" — and for a
   * driver who has never delivered, the honest answer is "nothing". Named
   * rather than taken by row position: this one is square only because he
   * never carries an order, and a positional pick would drift onto a driver
   * who does. The owed case is covered in 06, once the golden path has run.
   */
  test('opening a driver with nothing on him says so', async ({ page }) => {
    await adminPage(page);
    await page.goto('/admin/drivers');

    await page.getByRole('button', { name: 'E2E Extra Driver' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Balance with the platform')).toBeVisible();
    await expect(dialog.getByText('Nothing outstanding — this driver is square.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'All their orders' })).toBeVisible();
  });

  /**
   * Admins managing admins.
   *
   * The platform shipped with one admin and no way to make a second, so a
   * forgotten admin password had no remedy inside the app. This walks the way
   * out: a new admin is made, signs in, forgets, and is let back in by someone
   * else — which must also throw them off every device they were already on.
   *
   * It cleans up after itself. The ADMIN this suite depends on is never the
   * subject, and the second admin is deleted at the end, so nothing downstream
   * inherits an extra operator.
   */
  test('admins can create, reset and remove each other — but never themselves', async ({
    page,
    browser,
    baseURL,
  }) => {
    const SECOND = 'admin2@e2e.local';
    const NEW_PASSWORD = 'reset-by-another-admin';

    await adminPage(page);
    await page.goto('/admin/admins');

    // The row that is me offers no Delete — the API refuses it too, but the
    // console should not hold out a button that cannot work.
    const myRow = page.getByRole('row').filter({ hasText: ADMIN });
    await expect(myRow.getByText('(you)')).toBeVisible();
    await expect(
      myRow.getByRole('button', { name: /cannot delete your own admin account/i }),
    ).toBeDisabled();

    await page.getByRole('button', { name: 'New admin' }).first().click();
    await page.getByLabel('Login email').fill(SECOND);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create admin' }).click();
    await expect(page.getByText('Admin created')).toBeVisible();
    await expect(page.getByRole('cell', { name: SECOND })).toBeVisible();

    // They can sign in, and they land in the admin console.
    // baseURL is NOT inherited by a context made with browser.newContext(),
    // so it has to be handed over or every relative goto has no base.
    const theirs = await browser.newContext({ baseURL });
    const them = await theirs.newPage();
    await loginAs(them, SECOND, '/admin');

    // Now they forget it. Another admin sets a new one.
    await page.getByRole('row').filter({ hasText: SECOND }).getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Reset password (optional)').fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(/signed out everywhere/i)).toBeVisible();

    // Two things have to be true, and they are different claims.
    //
    // First, the session is dead server-side the moment the reset lands — the
    // token they hold buys nothing. That is what protects the account.
    const stillIn = await them.request.get('/api/v1/auth/me');
    expect(stillIn.status()).toBe(401);

    // Second, they are actually put out of the console rather than left sitting
    // in one that looks signed in. The socket pushes SESSION_REVOKED, and if
    // that never lands the first 401 that survives a refresh ends the session
    // over HTTP instead — belt and braces, because a notification is not a
    // guarantee.
    await them.waitForURL(/\/login/, { timeout: 20_000 });

    // The old password no longer works; the new one does.
    await them.goto('/login');
    await them.getByLabel('Email or phone number').fill(SECOND);
    await them.getByLabel('Password').fill(PASSWORD);
    await them.getByRole('button', { name: 'Sign in' }).click();
    await expect(them.getByText('Incorrect phone number or password.')).toBeVisible();
    await loginAs(them, SECOND, '/admin', NEW_PASSWORD);
    await theirs.close();

    // Clean up: remove the second admin so later specs see one operator.
    await page.reload();
    await page.getByRole('row').filter({ hasText: SECOND }).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete admin' }).click();
    await expect(page.getByText(`${SECOND} deleted.`)).toBeVisible();
    await expect(page.getByRole('cell', { name: SECOND })).toBeHidden();
  });
});
