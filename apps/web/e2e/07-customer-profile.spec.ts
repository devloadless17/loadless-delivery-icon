import { expect, test } from '@playwright/test';
import {
  ADMIN,
  createOrderUI,
  CUSTOMER_SEARCH,
  loginAs,
  ORDER_PHONE,
  uniquePhone,
  VENDOR,
  VENDOR2,
} from './helpers';

/**
 * The customer-360 panel: what a vendor sees while the customer is on the
 * phone, and the repeat-order path that follows from it.
 */
test.describe('customer profile', () => {
  test('a known customer shows history, stats and a usual address', async ({ page }) => {
    await loginAs(page, VENDOR, '/vendor');

    // Two orders to the same place, one elsewhere → "usual" is the repeated one.
    const { customerPhone } = await createOrderUI(page, { charge: '100000' });
    for (const address of ['Badaro, Sami el Solh Ave, Bldg 4', 'Verdun, side street 3']) {
      await page.goto('/vendor/orders/new');
      await page.getByPlaceholder(ORDER_PHONE).fill(customerPhone);
      await expect(page.getByText('E2E Order Customer')).toBeVisible();
      // A saved-address picker only appears once they have one; without it the
      // plain one-off field is already showing.
      const somewhereElse = page.getByRole('radio', { name: /Somewhere else/ });
      if (await somewhereElse.count()) await somewhereElse.click();
      await page.getByLabel('Address for THIS order').fill(address);
      await page.getByLabel('Amount').fill('100000');
      await page.getByRole('button', { name: 'Create order' }).click();
      await page.waitForURL((url) => /\/vendor\/orders\/[a-z0-9]{20,}$/.test(url.pathname));
    }

    await page.goto('/vendor/customers');
    await page.getByPlaceholder(CUSTOMER_SEARCH).fill(customerPhone);

    // Identity + the sentence the vendor actually says next.
    await expect(page.getByRole('heading', { name: /E2E Order Customer/ })).toBeVisible();
    await expect(page.getByText('Last order').first()).toBeVisible();

    // Stats: 3 orders with this vendor, none delivered yet. Scoped to the
    // cell — a bare getByText('3') matches any stray digit on the page.
    await expect(page.getByTestId('stat-orders')).toContainText('Orders with you');
    await expect(page.getByTestId('stat-orders-value')).toHaveText('3');
    await expect(page.getByTestId('stat-delivered-value')).toHaveText('0');

    // Their usual address is known from order history even though it was never
    // saved to the profile — so the order form can offer it in one tap.
    await page.goto('/vendor/orders/new');
    await page.getByPlaceholder(ORDER_PHONE).fill(customerPhone);
    await expect(page.getByText('Usually delivered to')).toBeVisible();
    await page.getByRole('button', { name: /Usually delivered to/ }).click();
    await expect(page.getByLabel('Address for THIS order')).toHaveValue(
      'Badaro, Sami el Solh Ave, Bldg 4',
    );

    await page.goto('/vendor/customers');
    await page.getByPlaceholder(CUSTOMER_SEARCH).fill(customerPhone);

    // History tab is seeded from the same payload — no extra request needed.
    await page.getByRole('tab', { name: /Orders/ }).click();
    await expect(page.getByText('Badaro, Sami el Solh Ave, Bldg 4').first()).toBeVisible();
  });

  test('every order starts blank — nothing rides along from the last one', async ({ page }) => {
    await loginAs(page, VENDOR, '/vendor');
    const phone = uniquePhone();

    // A first order with a distinctive charge and instructions.
    await page.goto('/vendor/orders/new');
    await page.getByPlaceholder(ORDER_PHONE).fill(phone);
    await page.getByLabel('Customer name (new customer)').fill('Fresh Start Customer');
    await page.getByLabel('Address for THIS order').fill('Achrafieh, Sassine, Bldg 9');
    await page.locator('#no-maps-link').fill('https://maps.app.goo.gl/fresh1');
    await page.getByLabel('Delivery instructions (optional)').fill('Ring twice');
    await page.getByLabel('Amount').fill('175000');
    await page.getByRole('button', { name: 'Create order' }).click();
    await page.waitForURL((url) => /\/vendor\/orders\/[a-z0-9]{20,}$/.test(url.pathname));

    // The profile offers no way to repeat it — that path is gone on purpose.
    await page.goto('/vendor/customers');
    await page.getByPlaceholder(CUSTOMER_SEARCH).fill(phone);
    await expect(page.getByRole('heading', { name: /Fresh Start Customer/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Repeat/ })).toHaveCount(0);

    // A second order for the SAME customer starts empty: the saved address may
    // be preselected, but no amount and no instructions carry over.
    await page.goto('/vendor/orders/new');
    await page.getByPlaceholder(ORDER_PHONE).fill(phone);
    await expect(page.getByText('Fresh Start Customer')).toBeVisible();
    await expect(page.getByLabel('Amount')).toHaveValue('');
    await expect(page.getByLabel('Delivery instructions (optional)')).toHaveValue('');
    await expect(page.getByText(/Repeating ORD-/)).toHaveCount(0);
  });

  test('"Start order here" carries the chosen address and nothing else', async ({ page }) => {
    await loginAs(page, VENDOR, '/vendor');
    const phone = uniquePhone();

    await page.goto('/vendor/customers');
    await page.getByPlaceholder(CUSTOMER_SEARCH).fill(phone);
    await page.getByLabel('Name').fill('Two Address Customer');
    await page.getByLabel('Address (optional)').fill('Hamra, Bliss street, Bldg 1');
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByText('Customer created')).toBeVisible();

    // A second address, so the pick is genuinely ambiguous without the link.
    await page.getByRole('button', { name: 'Add address' }).click();
    await page.locator('#new-address').fill('Jounieh, Maameltein, Bldg 7');
    await page.getByRole('button', { name: 'Save address' }).click();
    await expect(page.getByText('Address saved')).toBeVisible();

    await page
      .getByRole('listitem')
      .filter({ hasText: 'Jounieh, Maameltein' })
      .getByRole('button', { name: 'Start order here' })
      .click();

    await page.waitForURL('**/vendor/orders/new**');
    // That exact address is chosen — and the charge is still empty.
    await expect(page.getByText('Jounieh, Maameltein, Bldg 7').first()).toBeVisible();
    await expect(page.getByLabel('Amount')).toHaveValue('');
  });

  test('a vendor cannot correct a saved address — the platform can', async ({ page, browser }) => {
    await loginAs(page, VENDOR, '/vendor');
    const phone = uniquePhone();

    await page.goto('/vendor/customers');
    await page.getByPlaceholder(CUSTOMER_SEARCH).fill(phone);
    await page.getByLabel('Name').fill('Typo Customer');
    await page.getByLabel('Address (optional)').fill('Hamra steet, Bldg 3');
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByText('Customer created')).toBeVisible();
    await expect(page.getByText('Hamra steet, Bldg 3')).toBeVisible();

    // The vendor added it, and still gets no pen on it.
    await expect(page.getByRole('button', { name: 'Edit address' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Remove address' })).toHaveCount(0);

    // Admin corrects it for everyone, inline in the manage dialog.
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await loginAs(admin, ADMIN, '/admin');
    await admin.goto('/admin/customers');
    await admin.getByPlaceholder('Search by name or phone').fill(phone);
    await admin
      .getByRole('row')
      .filter({ hasText: 'Typo Customer' })
      .getByRole('button', { name: 'Manage' })
      .click();
    await admin.getByRole('button', { name: 'Edit address' }).click();
    await admin.locator('input[value="Hamra steet, Bldg 3"]').fill('Hamra street, Bldg 3');
    await admin.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(admin.getByText('Address updated')).toBeVisible();
    await adminCtx.close();

    // …and the vendor sees the corrected version.
    await page.reload();
    await page.getByPlaceholder(CUSTOMER_SEARCH).fill(phone);
    await expect(page.getByText('Hamra street, Bldg 3')).toBeVisible();
  });

  test('vendor and admin can both create a customer explicitly', async ({ page, browser }) => {
    await loginAs(page, VENDOR, '/vendor');
    const vendorPhone = uniquePhone();
    await page.goto('/vendor/customers');
    await page.getByRole('button', { name: 'New customer' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Phone number').fill(vendorPhone);
    await dialog.getByLabel('Name').fill('Vendor Made Customer');
    await dialog.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByText('Customer created')).toBeVisible();
    // The search box follows the new customer straight into their profile.
    await expect(page.getByRole('heading', { name: /Vendor Made Customer/ })).toBeVisible();

    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await loginAs(admin, ADMIN, '/admin');
    await admin.goto('/admin/customers');
    await admin.getByRole('button', { name: 'New customer' }).click();
    const adminDialog = admin.getByRole('dialog');
    await adminDialog.getByLabel('Phone number').fill(uniquePhone());
    await adminDialog.getByLabel('Name').fill('Admin Made Customer');
    await adminDialog.getByRole('button', { name: 'Create customer' }).click();
    await expect(admin.getByText('Customer created')).toBeVisible();
    await expect(admin.getByRole('dialog').getByText('Manage customer')).toBeVisible();
    await adminCtx.close();
  });

  test('a second vendor sees the person but none of the first vendor\'s trade', async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const vendorA = await ctxA.newPage();
    await loginAs(vendorA, VENDOR, '/vendor');
    const { customerPhone } = await createOrderUI(vendorA, { charge: '90000' });

    const ctxB = await browser.newContext();
    const vendorB = await ctxB.newPage();
    await loginAs(vendorB, VENDOR2, '/vendor');
    await vendorB.goto('/vendor/customers');
    await vendorB.getByPlaceholder(CUSTOMER_SEARCH).fill(customerPhone);

    // Identity is shared…
    await expect(vendorB.getByRole('heading', { name: /E2E Order Customer/ })).toBeVisible();
    // …but the other vendor's order history is not.
    await expect(vendorB.getByText('No orders with you yet')).toHaveCount(0);
    await vendorB.getByRole('tab', { name: /Orders/ }).click();
    await expect(vendorB.getByText('No orders with you yet')).toBeVisible();
    // …and no cross-vendor number stands in for it either. A count of orders
    // elsewhere would still tell this vendor another shop serves the customer.
    await expect(vendorB.getByText(/ordered \d+ times? on the platform/)).toHaveCount(0);
    await expect(vendorB.getByText(/\d+ on platform/)).toHaveCount(0);

    await ctxA.close();
    await ctxB.close();
  });
});
