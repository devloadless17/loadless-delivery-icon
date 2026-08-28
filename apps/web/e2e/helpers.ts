import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'e2epassword1';
export const ADMIN = 'admin@e2e.local';
export const VENDOR = 'vendor@e2e.local';
export const DRIVER1_PHONE = '71 999 888'; // 25% override
export const DRIVER2_PHONE = '71 999 777'; // platform default 30%

let phoneCounter = Date.now() % 1_000_000;

/** Unique, valid Lebanese mobile per call — never collides across specs. */
export function uniquePhone(): string {
  phoneCounter = (phoneCounter + 1) % 1_000_000;
  return `03${String(phoneCounter).padStart(6, '0')}`;
}

export async function login(page: Page, identifier: string, password = PASSWORD): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(identifier);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function loginAs(page: Page, identifier: string, home: string): Promise<void> {
  await login(page, identifier);
  await page.waitForURL(`**${home}`);
}

/** Drive the duty switch to the desired state regardless of what a prior spec left behind. */
export async function ensureDuty(page: Page, on: boolean): Promise<void> {
  await page.goto('/driver');
  const dutySwitch = page.getByRole('switch').first();
  await expect(dutySwitch).toBeVisible();
  const isOn = (await dutySwitch.getAttribute('aria-checked')) === 'true';
  if (isOn !== on) await dutySwitch.click();
  await expect(dutySwitch).toHaveAttribute('aria-checked', on ? 'true' : 'false');
}

export interface CreatedOrder {
  orderId: string;
  orderNumber: string;
  customerPhone: string;
}

/** The vendor's crown flow, via the real UI. Uses a fresh customer each time. */
export async function createOrderUI(
  vendor: Page,
  opts: { charge?: string; currency?: 'LBP' | 'USD'; customerName?: string } = {},
): Promise<CreatedOrder> {
  const customerPhone = uniquePhone();
  await vendor.goto('/vendor/orders/new');
  await vendor.getByPlaceholder('Customer phone — 03 123 456').fill(customerPhone);
  await vendor
    .getByLabel('Customer name (new customer)')
    .fill(opts.customerName ?? 'E2E Order Customer');
  await vendor.getByLabel('Address for THIS order').fill('Badaro, Sami el Solh Ave, Bldg 4');
  if (opts.currency && opts.currency !== 'LBP') {
    await vendor.getByRole('combobox').click();
    await vendor.getByRole('option', { name: opts.currency }).click();
  }
  await vendor.getByLabel('Amount').fill(opts.charge ?? '100000');
  await vendor.getByRole('button', { name: 'Create order' }).click();
  // detail URLs end in a cuid — the glob '**/orders/**' would also match /orders/new
  await vendor.waitForURL((url) => /\/vendor\/orders\/[a-z0-9]{20,}$/.test(url.pathname));

  const orderNumber = (await vendor.locator('h1').innerText()).trim();
  const orderId = vendor.url().split('/').pop() as string;
  return { orderId, orderNumber, customerPhone };
}

/** Fast setup steps use the API through the page's own cookie jar. */
export async function apiPost(page: Page, path: string, data?: unknown): Promise<void> {
  const res = await page.request.post(`/api/v1${path}`, data ? { data } : {});
  if (!res.ok()) {
    throw new Error(`API setup call failed: POST ${path} -> ${res.status()} ${await res.text()}`);
  }
}
