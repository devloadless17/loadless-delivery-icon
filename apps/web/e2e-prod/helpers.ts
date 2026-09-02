import { expect, type Page } from '@playwright/test';

/**
 * Shared setup for the PRODUCTION verification suite.
 *
 * Every record this suite creates is stamped PRODCHECK-<run> so it can be found
 * and removed afterwards, and nothing it does touches data it did not make. The
 * one hard rule beyond that: NEVER change platform settings. That number is
 * what every future order's commission snapshot is computed from, so a test
 * that nudges it and puts it back still mis-prices anything created in between.
 */

export const ADMIN_EMAIL = process.env.PROD_ADMIN_EMAIL ?? 'ali@loadless.ai';
export const ADMIN_PASSWORD = process.env.PROD_ADMIN_PASSWORD ?? '';

/** One stamp per whole run, so a re-run cannot collide with the last. */
export const RUN = process.env.PRODCHECK_RUN ?? String(Date.now()).slice(-8);
export const STAMP = `PRODCHECK-${RUN}`;
export const PASSWORD = 'ProdCheck!2026';

export const VENDOR_A_EMAIL = `pc-a-${RUN}@loadless.local`;
export const VENDOR_B_EMAIL = `pc-b-${RUN}@loadless.local`;

/** Lebanese mobiles that are valid and unique to this run. */
const base = Number(RUN.slice(-6));
export const DRIVER_A_PHONE = `03${String(base % 1_000_000).padStart(6, '0')}`;
export const DRIVER_B_PHONE = `71${String((base + 1) % 1_000_000).padStart(6, '0')}`;
export const CUSTOMER_1_PHONE = `76${String((base + 2) % 1_000_000).padStart(6, '0')}`;
export const CUSTOMER_2_PHONE = `78${String((base + 3) % 1_000_000).padStart(6, '0')}`;

/** "03123456" -> "03 123 456", the way every table renders a stored number. */
export function displayedPhone(phone: string): string {
  return `${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5)}`;
}

export async function login(page: Page, identifier: string, password: string, home: string) {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill(identifier);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`**${home}`);
}

export const asAdmin = (page: Page) => login(page, ADMIN_EMAIL, ADMIN_PASSWORD, '/admin');

export async function ensureDuty(page: Page, on: boolean) {
  await page.goto('/driver');
  const duty = page.getByRole('switch').first();
  await expect(duty).toBeVisible();
  if ((await duty.getAttribute('aria-checked')) === 'true') {
    if (!on) await duty.click();
  } else if (on) {
    await duty.click();
  }
  await expect(duty).toHaveAttribute('aria-checked', on ? 'true' : 'false');
}

/** Post through the page's own cookie jar — used for fast, deterministic setup. */
export async function apiPost(page: Page, path: string, data?: unknown) {
  const res = await page.request.post(`/api/v1${path}`, data ? { data } : {});
  if (!res.ok()) throw new Error(`POST ${path} -> ${res.status()} ${await res.text()}`);
  return res;
}

/** Nothing may push a page sideways — the classic mobile defect. */
export async function expectNoSidewaysScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    view: document.documentElement.clientWidth,
  }));
  expect(
    overflow.scroll <= overflow.view + 1,
    `${where} scrolls sideways (${overflow.scroll}px of content in ${overflow.view}px)`,
  ).toBe(true);
}

export async function createOrder(
  vendor: Page,
  opts: { customerPhone: string; customerName: string; charge: string; currency?: 'LBP' | 'USD' },
) {
  await vendor.goto('/vendor/orders/new');
  await vendor.getByPlaceholder('Customer phone — 03 123 456').fill(opts.customerPhone);
  const nameField = vendor.getByLabel('Customer name (new customer)');
  if (await nameField.isVisible().catch(() => false)) await nameField.fill(opts.customerName);
  await vendor.getByLabel('Address for THIS order').fill(`${STAMP} Hamra, Beirut`);
  if (opts.currency === 'USD') {
    await vendor.locator('#no-currency').click();
    await vendor.getByRole('option', { name: 'USD' }).click();
  }
  await vendor.getByLabel('Amount').fill(opts.charge);
  await vendor.getByRole('button', { name: 'Create order' }).click();
  await vendor.waitForURL((u) => /\/vendor\/orders\/[a-z0-9]{20,}$/.test(u.pathname));
  return {
    orderId: vendor.url().split('/').pop() as string,
    orderNumber: (await vendor.locator('h1').innerText()).trim(),
  };
}
