import { expect, test } from '@playwright/test';
import { loginAs, uniquePhone, VENDOR } from './helpers';

/**
 * The shared global customer system, at the UI level: creation, cross-format
 * identity, edits with history, addresses, and cross-vendor sharing
 * (vendor2@e2e.local created by 02-admin).
 */
test.describe('shared customer system', () => {
  test('full customer lifecycle + the number is one identity in every format', async ({ page }) => {
    await loginAs(page, VENDOR, '/vendor');
    await page.goto('/vendor/customers');

    const phone = uniquePhone(); // e.g. 03XXXXXX
    const search = page.getByPlaceholder('Customer phone — 03 123 456');

    // partial number → helpful hint, no result yet
    await search.fill('03 12');
    await expect(page.getByText('Keep typing — enter a full number.')).toBeVisible();

    // unknown full number → inline create
    await search.fill(phone);
    await expect(page.getByText(/isn't on the platform yet/)).toBeVisible();

    // name is required
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByText(/Enter the customer.s name/).first()).toBeVisible();

    await page.getByLabel('Name').fill('Rana Khoury');
    await page.getByLabel('Address (optional)').fill('Ashrafieh, Sassine square');
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByText('Customer created')).toBeVisible();

    // reload the SAME customer through a different spelling of the number
    const intl = `+961 ${phone.slice(1, 3)} ${phone.slice(3)}`; // "+961 3X XXXXX"-ish
    await search.fill(intl);
    await expect(page.getByText('Rana Khoury')).toBeVisible();
    await expect(page.getByText('Shared customer')).toBeVisible();
    await expect(page.getByText('Ashrafieh, Sassine square')).toBeVisible();

    // edit name (global, with history)
    await page.getByRole('button', { name: 'Edit name' }).click();
    const nameInput = page.locator('input[value="Rana Khoury"]');
    await nameInput.fill('Rana K. Khoury');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Name updated')).toBeVisible();

    // add a WORK address, then archive it
    await page.getByRole('button', { name: 'Add address' }).click();
    const addForm = page.getByRole('form', { name: 'New address' });
    await addForm.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Work' }).click();
    await page.locator('#new-address').fill('Downtown, Bank street, Office 12');
    await page.getByRole('button', { name: 'Save address' }).click();
    await expect(page.getByText('Address saved')).toBeVisible();
    await expect(page.getByText('Downtown, Bank street, Office 12')).toBeVisible();

    const workAddress = page.getByRole('listitem').filter({ hasText: 'Downtown, Bank street' });
    await workAddress.getByRole('button', { name: 'Remove address' }).click();
    // Removal confirms inline (no modal) — one extra tap, no focus trap mid-call.
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText('Downtown, Bank street, Office 12')).toHaveCount(0);

    // ANOTHER vendor finds the same global customer — the core sharing promise
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/login');
    await loginAs(page, 'vendor2@e2e.local', '/vendor');
    await page.goto('/vendor/customers');
    await page.getByPlaceholder('Customer phone — 03 123 456').fill(phone);
    await expect(page.getByText('Rana K. Khoury')).toBeVisible();
    await expect(page.getByText('Ashrafieh, Sassine square')).toBeVisible();
  });
});
