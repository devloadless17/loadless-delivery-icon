import { expect, type BrowserContext, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readRunId } from './run-id';

/**
 * Shared setup for the PRODUCTION verification suite.
 *
 * Every record this suite creates is stamped PRODCHECK-<run> so it can be found
 * and removed afterwards, and nothing it does touches data it did not make. The
 * one hard rule beyond that: NEVER change platform settings. That number is
 * what every future order's commission snapshot is computed from, so a test
 * that nudges it and puts it back still mis-prices anything created in between.
 */

export const ADMIN_EMAIL = process.env.PROD_ADMIN_EMAIL ?? 'admin@flashdelivery.com';
export const ADMIN_PASSWORD = process.env.PROD_ADMIN_PASSWORD ?? '';

/**
 * A deliberate, awkward opt-in — required IN ADDITION to the password.
 *
 * This suite WRITES to production: it creates vendors, drivers, customers,
 * orders and settlements, and records real handovers. That was appropriate on
 * an empty platform being commissioned. It is NOT appropriate once real trade
 * is running, where the same run means fabricated deliveries and fabricated
 * money sitting alongside a real business's books.
 *
 * A password alone is too easy to have lying around in a shell, so it is not
 * enough to start this. The phrase below has to be typed on purpose, and its
 * wording is the warning:
 *
 *   PRODCHECK_I_UNDERSTAND_THIS_WRITES_REAL_DATA=yes
 *
 * Before ever setting it again, ask whether production has real customers in
 * it. If the answer is yes or "not sure", the answer to running this is no.
 */
export const WRITE_CONFIRMED =
  process.env.PRODCHECK_I_UNDERSTAND_THIS_WRITES_REAL_DATA === 'yes';

/** Every spec guards on this. Missing password OR missing consent = skip. */
export const SKIP_REASON = !ADMIN_PASSWORD
  ? 'PROD_ADMIN_PASSWORD not set — refusing to guess production credentials'
  : !WRITE_CONFIRMED
    ? 'Refusing to run: this suite WRITES to production. Set PRODCHECK_I_UNDERSTAND_THIS_WRITES_REAL_DATA=yes only if production has no real data to spoil.'
    : '';

/**
 * One stamp for the WHOLE run, read from the file globalSetup wrote.
 *
 * Not Date.now() at module load: that is per process, and Playwright restarts
 * its worker after a failure — so one failure changed every identity the
 * remaining specs used, and they failed signing in as accounts that were never
 * created.
 */
export const RUN = readRunId();
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

/**
 * Sign-in is rate-limited to 5 attempts per ACCOUNT per minute — correct
 * product behaviour, and something a test suite has to respect rather than
 * work around. Logging in afresh in every test burned the allowance by the
 * ninth one, the login 429'd, and the navigation never came: the suite failed
 * as a 90-second timeout that looked like production being slow.
 *
 * So each account signs in ONCE per run and its cookies are reused. Playwright
 * gives every test a fresh context, so the session is replayed onto it rather
 * than re-earned.
 */
type Cookies = Parameters<BrowserContext['addCookies']>[0];

/**
 * Sessions are cached on DISK, not in memory.
 *
 * Sign-in is limited to 5 attempts per account per minute — correct behaviour,
 * and a suite has to live within it. An in-memory cache does not: Playwright
 * gives each project its own worker and restarts a worker after a failure, so
 * the cache is empty precisely when it matters and every restart re-earns every
 * session. That is how a run ends up throttled and reports "Too many attempts"
 * as a 90-second navigation timeout.
 */
const SESSION_DIR = join(process.cwd(), 'test-results', '.sessions');
const sessionFile = (identifier: string) =>
  join(SESSION_DIR, `${createHash('sha256').update(identifier).digest('hex').slice(0, 16)}.json`);

function loadSession(identifier: string): Cookies | null {
  const f = sessionFile(identifier);
  if (!existsSync(f)) return null;
  try {
    return JSON.parse(readFileSync(f, 'utf8')) as Cookies;
  } catch {
    return null;
  }
}

function saveSession(identifier: string, cookies: Cookies) {
  mkdirSync(SESSION_DIR, { recursive: true });
  writeFileSync(sessionFile(identifier), JSON.stringify(cookies), 'utf8');
}

export async function login(page: Page, identifier: string, password: string, home: string) {
  const cached = loadSession(identifier);
  if (cached) {
    await page.context().addCookies(cached);
    await page.goto(home);
    // If the replayed session is no longer good the app bounces to /login;
    // fall through and sign in properly rather than failing obscurely later.
    if (!page.url().includes('/login')) return;
  }

  // Sign-in allows 5 attempts per account per minute. That is the product being
  // right, not an obstacle to route around, so when the suite does trip it the
  // honest response is to wait the window out and try once more — never to
  // weaken the limit or spread logins across accounts to dodge it.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/login');
    await page.getByLabel('Email or phone number').fill(identifier);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    const landed = await page
      .waitForURL(`**${home}`, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);

    if (landed) {
      saveSession(identifier, await page.context().cookies());
      return;
    }

    const alerts = (await page.locator('[role="alert"]').allInnerTexts()).join(' | ');
    if (attempt === 0 && /too many/i.test(alerts)) {
      await page.waitForTimeout(62_000);
      continue;
    }
    throw new Error(`Sign-in as ${identifier} did not land on ${home}: ${alerts || '(no message)'}`);
  }
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
  // The name field appears only once the phone resolves to a NEW customer, and
  // isVisible() answers immediately rather than waiting — so a slow lookup meant
  // the name was silently skipped and the form failed validation. The click then
  // did nothing and the test died waiting for a navigation that was never coming.
  const nameField = vendor.getByLabel('Customer name (new customer)');
  await nameField.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  if (await nameField.isVisible().catch(() => false)) {
    await nameField.fill(opts.customerName);
  }
  await vendor.getByLabel('Address for THIS order').fill(`${STAMP} Hamra, Beirut`);
  if (opts.currency === 'USD') {
    await vendor.locator('#no-currency').click();
    await vendor.getByRole('option', { name: 'USD' }).click();
  }
  await vendor.getByLabel('Amount').fill(opts.charge);
  await vendor.getByRole('button', { name: 'Create order' }).click();
  // Surface a refusal as a refusal. Without this a rejected form is reported as
  // a navigation timeout, which reads like the site is down.
  await vendor
    .waitForURL((u) => /\/vendor\/orders\/[a-z0-9]{20,}$/.test(u.pathname), { timeout: 20_000 })
    .catch(async () => {
      const problem = await vendor.locator('[role="alert"], .text-destructive').allInnerTexts();
      throw new Error(
        `Create order did not navigate. Page said: ${problem.join(' | ') || '(nothing)'}`,
      );
    });
  return {
    orderId: vendor.url().split('/').pop() as string,
    orderNumber: (await vendor.locator('h1').innerText()).trim(),
  };
}
