import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN,
  createOrderUI,
  CUSTOMER_SEARCH,
  displayedPhone,
  loginAs,
  ORDER_PHONE,
  uniquePhone,
  VENDOR,
  VENDOR2,
} from './helpers';

/**
 * The vendor <-> customer relationship, from both sides at once.
 *
 * Customers stay global — anyone reachable by phone — but the RELATIONSHIP is
 * private: my list is mine, my name for them is mine, and what I added stays
 * how I left it. These specs are the ones that would catch the two failures
 * that actually hurt: one shop browsing another's client book, and a second
 * vendor silently rewriting the first vendor's data.
 */

async function openMyCustomers(page: Page) {
  await page.goto('/vendor/customers');
  // The list gives way to a profile once the box holds a complete number, so
  // clear it in case a previous action left one there.
  await page.getByPlaceholder(CUSTOMER_SEARCH).fill('');
  await expect(page.getByRole('region', { name: 'My customers' })).toBeVisible();
}

/**
 * A row keyed on the customer's PHONE, not their name: names are fixed strings
 * in these specs and would collide if the database already holds a previous
 * run's data. The phone comes from uniquePhone() and never repeats.
 */
function row(page: Page, phone: string) {
  return page.getByRole('row').filter({ hasText: displayedPhone(phone) });
}

test.describe('my customers', () => {
  test('ordering for someone adds them to my list — and only to mine', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const vendorA = await ctxA.newPage();
    await loginAs(vendorA, VENDOR, '/vendor');

    const { customerPhone } = await createOrderUI(vendorA, {
      charge: '120000',
      customerName: 'Relationship Customer',
    });

    await openMyCustomers(vendorA);
    const mine = row(vendorA, customerPhone);
    await expect(mine).toBeVisible();
    await expect(mine.getByText('Added by you')).toBeVisible();
    // Third cell is the order count — a bare toContainText('1') would also
    // match a digit in the phone number.
    await expect(mine.getByRole('cell').nth(2)).toHaveText('1');

    // Search as you type: a partial number, typed the local way, finds them
    // without finishing it — and so does a piece of the name.
    const search = vendorA.getByPlaceholder(CUSTOMER_SEARCH);
    await search.fill(customerPhone.slice(0, 6));
    await expect(row(vendorA, customerPhone)).toBeVisible();
    await search.fill('lationship');
    await expect(row(vendorA, customerPhone)).toBeVisible();
    await search.fill('');

    // Clicking a row loads the SAME inline profile the phone search renders.
    await mine.click();
    await expect(
      vendorA.getByRole('heading', { name: /Relationship Customer/ }),
    ).toBeVisible();

    // Vendor B has never dealt with them: not in their list, not findable by
    // name — but still reachable by full phone number.
    const ctxB = await browser.newContext();
    const vendorB = await ctxB.newPage();
    await loginAs(vendorB, VENDOR2, '/vendor');
    await openMyCustomers(vendorB);
    await vendorB.getByPlaceholder(CUSTOMER_SEARCH).fill('Relationship Customer');
    await expect(vendorB.getByText('No match among your customers')).toBeVisible();
    await expect(vendorB.getByText('Relationship Customer')).toHaveCount(0);

    // The full number still reaches them — that is the ONLY way in.
    await vendorB.getByPlaceholder(CUSTOMER_SEARCH).fill(customerPhone);
    await expect(vendorB.getByRole('heading', { name: /Relationship Customer/ })).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });

  test('an unfinished number finds a stranger; their NAME never does', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const vendorA = await ctxA.newPage();
    await loginAs(vendorA, VENDOR, '/vendor');
    const { customerPhone } = await createOrderUI(vendorA, {
      charge: '65000',
      customerName: 'Partial Lookup Customer',
    });

    const ctxB = await browser.newContext();
    const vendorB = await ctxB.newPage();
    await loginAs(vendorB, VENDOR2, '/vendor');
    await openMyCustomers(vendorB);
    const search = vendorB.getByPlaceholder(CUSTOMER_SEARCH);

    // One digit short of the whole number: the person still surfaces, under a
    // heading that says plainly they are not this vendor's customer.
    await search.fill(customerPhone.slice(0, 7));
    const platform = vendorB.getByRole('region', { name: 'On the platform' });
    await expect(platform).toBeVisible();
    await expect(platform.getByText('Partial Lookup Customer')).toBeVisible();
    // Identity only. Naming the exact things that must never appear beats a
    // catch-all regex, which matches incidental copy and teaches nothing.
    await expect(platform.getByText('E2E Burger House')).toHaveCount(0); // the other shop
    await expect(platform.getByText('Added by you')).toHaveCount(0);
    await expect(platform.getByText('Badaro, Sami el Solh Ave, Bldg 4')).toHaveCount(0);

    // Their NAME is not a way in. This is the line the product holds.
    await search.fill('Partial Lookup');
    await expect(vendorB.getByText('No match among your customers')).toBeVisible();
    await expect(vendorB.getByRole('region', { name: 'On the platform' })).toHaveCount(0);

    // Too few digits is not a way in either.
    await search.fill(customerPhone.slice(0, 4));
    await expect(vendorB.getByRole('region', { name: 'On the platform' })).toHaveCount(0);

    // Picking a candidate opens the ordinary profile.
    await search.fill(customerPhone.slice(0, 7));
    await platform.getByText('Partial Lookup Customer').click();
    await expect(
      vendorB.getByRole('heading', { name: /Partial Lookup Customer/ }),
    ).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });

  test('a second vendor ordering joins the relationship without taking it over', async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const vendorA = await ctxA.newPage();
    await loginAs(vendorA, VENDOR, '/vendor');
    const { customerPhone } = await createOrderUI(vendorA, {
      charge: '80000',
      customerName: 'Two Shop Customer',
    });

    const ctxB = await browser.newContext();
    const vendorB = await ctxB.newPage();
    await loginAs(vendorB, VENDOR2, '/vendor');

    // B orders for the same person → the customer becomes theirs too.
    await vendorB.goto('/vendor/orders/new');
    await vendorB.getByPlaceholder(ORDER_PHONE).fill(customerPhone);
    await expect(vendorB.getByText('Two Shop Customer')).toBeVisible();
    const somewhereElse = vendorB.getByRole('radio', { name: /Somewhere else/ });
    if (await somewhereElse.count()) await somewhereElse.click();
    await vendorB.getByLabel('Address for THIS order').fill('Mar Mikhael, Armenia st');
    await vendorB.getByLabel('Amount').fill('60000');
    await vendorB.getByRole('button', { name: 'Create order' }).click();
    await vendorB.waitForURL((url) => /\/vendor\/orders\/[a-z0-9]{20,}$/.test(url.pathname));

    await openMyCustomers(vendorB);
    const theirRow = row(vendorB, customerPhone);
    await expect(theirRow).toBeVisible();
    // Theirs now — but they did not ADD them, so no badge.
    await expect(theirRow.getByText('Added by you')).toHaveCount(0);

    // …and vendor A still has them, with their own separate order count.
    await openMyCustomers(vendorA);
    await expect(row(vendorA, customerPhone).getByText('Added by you')).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });

  test('my private name is mine: the other vendor never sees it', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const vendorA = await ctxA.newPage();
    await loginAs(vendorA, VENDOR, '/vendor');
    const { customerPhone } = await createOrderUI(vendorA, {
      charge: '70000',
      customerName: 'Ahmad Original',
    });

    const ctxB = await browser.newContext();
    const vendorB = await ctxB.newPage();
    await loginAs(vendorB, VENDOR2, '/vendor');
    await vendorB.goto('/vendor/customers');
    await vendorB.getByPlaceholder(CUSTOMER_SEARCH).fill(customerPhone);
    await expect(vendorB.getByRole('heading', { name: /Ahmad Original/ })).toBeVisible();

    // B did not add them, so the editor warns BEFORE the keystroke that this
    // is a private label — that sentence is the whole feature.
    await vendorB.getByRole('button', { name: 'Edit name' }).click();
    await expect(vendorB.getByText(/Only you will see this name/)).toBeVisible();
    await expect(vendorB.getByText(/Ahmad Original/).first()).toBeVisible();
    await vendorB.locator('input[value="Ahmad Original"]').fill('Ahmad – Falafel regular');
    await vendorB.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(vendorB.getByText('Saved — only you see this name')).toBeVisible();
    await expect(
      vendorB.getByRole('heading', { name: /Ahmad – Falafel regular/ }),
    ).toBeVisible();
    await expect(vendorB.getByText(/platform shows/)).toBeVisible();

    // Vendor A's screen is untouched — the failure this feature exists to stop.
    await vendorA.goto('/vendor/customers');
    await vendorA.getByPlaceholder(CUSTOMER_SEARCH).fill(customerPhone);
    await expect(vendorA.getByRole('heading', { name: /Ahmad Original/ })).toBeVisible();
    await expect(vendorA.getByText('Falafel regular')).toHaveCount(0);
    // A added them, so A holds the pen on the shared name.
    await vendorA.getByRole('button', { name: 'Edit name' }).click();
    await expect(vendorA.getByText('Everyone on the platform sees this name.')).toBeVisible();
    await vendorA.getByRole('button', { name: 'Cancel' }).click();

    // B can hand the pen back and follow the shared record again.
    await vendorB.getByRole('button', { name: 'Use platform name' }).click();
    await expect(vendorB.getByRole('heading', { name: /Ahmad Original/ })).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });

  test('an address I did not add is read-only — I save my own version', async ({ browser }) => {
    const phone = uniquePhone();

    const ctxA = await browser.newContext();
    const vendorA = await ctxA.newPage();
    await loginAs(vendorA, VENDOR, '/vendor');
    await vendorA.goto('/vendor/customers');
    await vendorA.getByPlaceholder(CUSTOMER_SEARCH).fill(phone);
    await vendorA.getByLabel('Name').fill('Address Owner Test');
    await vendorA.getByLabel('Address (optional)').fill('Gemmayze, Gouraud st, Bldg 5');
    await vendorA.getByRole('button', { name: 'Create customer' }).click();
    await expect(vendorA.getByText('Customer created')).toBeVisible();

    const ctxB = await browser.newContext();
    const vendorB = await ctxB.newPage();
    await loginAs(vendorB, VENDOR2, '/vendor');
    await vendorB.goto('/vendor/customers');
    await vendorB.getByPlaceholder(CUSTOMER_SEARCH).fill(phone);

    // B can READ it — sharing is the point — but not rewrite it.
    await expect(vendorB.getByText('Gemmayze, Gouraud st, Bldg 5')).toBeVisible();
    await expect(vendorB.getByText('Added by another vendor')).toBeVisible();
    await expect(vendorB.getByRole('button', { name: 'Edit address' })).toHaveCount(0);
    await expect(vendorB.getByRole('button', { name: 'Remove address' })).toHaveCount(0);

    // The way forward: copy it, correct it, own the copy.
    await vendorB.getByRole('button', { name: 'Copy & correct' }).click();
    const addForm = vendorB.getByRole('form', { name: 'New address' });
    await expect(addForm).toBeVisible();
    await vendorB.locator('#new-address').fill('Gemmayze, Gouraud st, Bldg 5, 2nd floor');
    await vendorB.getByRole('button', { name: 'Save address' }).click();
    await expect(vendorB.getByText('Address saved')).toBeVisible();

    // Now B owns their copy and can edit it; A's row is still exactly as A left it.
    await expect(vendorB.getByRole('button', { name: 'Edit address' })).toHaveCount(1);

    await vendorA.goto('/vendor/customers');
    await vendorA.getByPlaceholder(CUSTOMER_SEARCH).fill(phone);
    await expect(vendorA.getByText('Gemmayze, Gouraud st, Bldg 5', { exact: true })).toBeVisible();
    await expect(vendorA.getByRole('button', { name: 'Edit address' })).toHaveCount(1);
    await expect(vendorA.getByText('Added by another vendor')).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });

  test('admin sees every vendor on a customer, and can filter the directory', async ({
    browser,
  }) => {
    const ctxA = await browser.newContext();
    const vendorA = await ctxA.newPage();
    await loginAs(vendorA, VENDOR, '/vendor');
    const { customerPhone } = await createOrderUI(vendorA, {
      charge: '55000',
      customerName: 'Admin Visible Customer',
    });

    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await loginAs(admin, ADMIN, '/admin');
    await admin.goto('/admin/customers');
    await admin.getByPlaceholder('Search by name or phone').fill(customerPhone);
    // Keyed on the phone for the same reason as row() above.
    const adminRow = admin.getByRole('row').filter({ hasText: displayedPhone(customerPhone) });
    await expect(adminRow).toBeVisible();
    await adminRow.getByRole('button', { name: 'Manage' }).click();
    const dialog = admin.getByRole('dialog');
    await expect(dialog.getByText('Vendors')).toBeVisible();
    await expect(dialog.getByText('E2E Burger House')).toBeVisible();
    await expect(dialog.getByText('Added them')).toBeVisible();
    // Admin may correct any address, whoever added it.
    await admin.keyboard.press('Escape');

    // Narrowing the directory to one vendor's customers.
    await admin.getByPlaceholder('Search by name or phone').fill('');
    await admin.getByRole('combobox').click();
    await admin.getByRole('option', { name: 'E2E Falafel Corner' }).click();
    await expect(admin.getByRole('table')).toBeVisible();
    await expect(admin.getByRole('cell', { name: 'Admin Visible Customer' })).toHaveCount(0);

    await ctxA.close();
    await adminCtx.close();
  });
});
