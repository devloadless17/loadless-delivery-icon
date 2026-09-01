import { expect, test } from '@playwright/test';
import { CUSTOMER_SEARCH, loginAs, uniquePhone, VENDOR, VENDOR2 } from './helpers';

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
    const search = page.getByPlaceholder(CUSTOMER_SEARCH);

    // A partial number narrows their OWN customers as they type; it never
    // opens a stranger's record until the number is complete.
    await search.fill('03 12');
    await expect(page.getByRole('region', { name: 'My customers' })).toBeVisible();

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
    // This vendor entered them, so they hold the pen on the shared name.
    await expect(page.getByText('Added by you')).toBeVisible();
    await expect(page.getByText('Ashrafieh, Sassine square')).toBeVisible();

    // The pen writes the vendor's OWN label — never the shared name, even
    // though this vendor is the one who added the customer.
    await page.getByRole('button', { name: 'Edit name' }).click();
    await expect(page.getByText(/Only you will see this name/)).toBeVisible();
    await page.locator('input[value="Rana Khoury"]').fill('Rana the regular');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved — only you see this name')).toBeVisible();

    // A vendor ADDS a place…
    await page.getByRole('button', { name: 'Add address' }).click();
    const addForm = page.getByRole('form', { name: 'New address' });
    await addForm.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Work' }).click();
    await page.locator('#new-address').fill('Downtown, Bank street, Office 12');
    await page.getByRole('button', { name: 'Save address' }).click();
    await expect(page.getByText('Address saved')).toBeVisible();
    await expect(page.getByText('Downtown, Bank street, Office 12')).toBeVisible();

    // …and cannot edit or remove it, or anything else. The platform owns
    // saved addresses; the vendor's freedom lives on the order.
    await expect(page.getByRole('button', { name: 'Edit address' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove address' })).toHaveCount(0);

    // ANOTHER vendor finds the same global customer — the core sharing promise
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('**/login');
    await loginAs(page, VENDOR2, '/vendor');
    await page.goto('/vendor/customers');
    await page.getByPlaceholder(CUSTOMER_SEARCH).fill(phone);
    // The first vendor's private label never reached them.
    await expect(page.getByText('Rana Khoury')).toBeVisible();
    await expect(page.getByText('the regular')).toHaveCount(0);
    await expect(page.getByText('Ashrafieh, Sassine square')).toBeVisible();
    await expect(page.getByText('Shared customer')).toBeVisible();
    await expect(page.getByText('Added by you')).toHaveCount(0);
  });
});
