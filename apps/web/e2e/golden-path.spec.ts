import { expect, test, type Page } from '@playwright/test';

/**
 * THE golden path — one flow, three roles, real API + DB + sockets:
 * vendor creates a customer + order → driver goes on duty, sees it live,
 * accepts, picks up, delivers → earnings and vendor status are correct.
 *
 * Fixtures from seed-e2e: vendor@e2e.local / +961 71 999 888, password
 * e2epassword1, driver commission 25%.
 */

const PASSWORD = 'e2epassword1';
// unique per run so the flow never collides with leftovers
const CUSTOMER_PHONE = `03${String(Date.now()).slice(-6)}`;

async function login(page: Page, identifier: string) {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(identifier);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('vendor creates order → driver delivers it → money is right', async ({ browser }) => {
  const vendorContext = await browser.newContext();
  const driverContext = await browser.newContext();
  const vendor = await vendorContext.newPage();
  const driver = await driverContext.newPage();

  // ---- vendor: create the order ------------------------------------------
  await login(vendor, 'vendor@e2e.local');
  await vendor.waitForURL('**/vendor');

  await vendor.goto('/vendor/orders/new');
  await vendor.getByPlaceholder('Customer phone — 03 123 456').fill(CUSTOMER_PHONE);
  await vendor.getByLabel('Customer name (new customer)').fill('Playwright Customer');
  await vendor.getByLabel('Address for THIS order').fill('Hamra, Makdessi street, Bldg 9');
  await vendor.getByLabel('Amount').fill('100000');
  await vendor.getByRole('button', { name: 'Create order' }).click();

  await vendor.waitForURL('**/vendor/orders/**');
  await expect(vendor.getByText('Waiting for driver').first()).toBeVisible();
  const orderNumber = (await vendor.locator('h1').innerText()).trim();
  expect(orderNumber).toMatch(/^ORD-\d{4}-\d{6}$/);

  // ---- driver: on duty, accept from the live feed ------------------------
  await login(driver, '71 999 888');
  await driver.waitForURL('**/driver');

  // State-agnostic: a previous run may have left the driver on duty.
  const dutySwitch = driver.getByRole('switch').first();
  await expect(dutySwitch).toBeVisible();
  if ((await dutySwitch.getAttribute('aria-checked')) !== 'true') {
    await dutySwitch.click();
  }
  await expect(driver.getByRole('switch', { name: 'Go off duty' }).first()).toBeVisible();
  await expect(driver.getByText('E2E Burger House').first()).toBeVisible();

  await driver.getByRole('button', { name: 'Accept order' }).first().click();
  await expect(driver.getByText(/is yours/)).toBeVisible();

  // ---- vendor sees the assignment live (socket-driven refetch) -----------
  await expect(vendor.getByText('Driver assigned').first()).toBeVisible({ timeout: 15_000 });
  await expect(vendor.getByText('E2E Driver').first()).toBeVisible();

  // ---- driver: pickup → deliver ------------------------------------------
  await driver.goto('/driver/active');
  await driver.getByText(orderNumber).click();
  await driver.getByRole('button', { name: /Picked up from/ }).click();
  await expect(driver.getByText('On the way').first()).toBeVisible();

  await driver.getByRole('button', { name: 'Delivered to customer' }).click();
  await driver.getByRole('button', { name: 'Yes, delivered' }).click();
  await driver.waitForURL('**/driver/active');

  // ---- money: 100,000 LBP at the driver's 25% => 75,000 earnings ---------
  await driver.goto('/driver/earnings');
  await expect(driver.getByText('75,000 LBP').first()).toBeVisible();

  // ---- vendor sees delivered, and never sees the split -------------------
  await vendor.reload();
  await expect(vendor.getByText('Delivered', { exact: true }).first()).toBeVisible();
  await expect(vendor.getByText('75,000')).toHaveCount(0);

  await vendorContext.close();
  await driverContext.close();
});
