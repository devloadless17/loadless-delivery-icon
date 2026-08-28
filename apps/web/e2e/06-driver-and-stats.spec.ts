import { expect, test } from '@playwright/test';
import { ADMIN, DRIVER1_PHONE, ensureDuty, loginAs, VENDOR } from './helpers';

/**
 * Driver experience states + the money surfaces (driver earnings, vendor
 * stats, admin dashboard) after the earlier specs produced real activity.
 */
test.describe('driver experience and money surfaces', () => {
  test('off-duty drivers see the empty state, not the feed', async ({ page }) => {
    await loginAs(page, DRIVER1_PHONE, '/driver');
    await ensureDuty(page, false);
    await expect(page.getByText("You're off duty")).toBeVisible();
    await ensureDuty(page, true);
    await expect(page.getByText("You're off duty")).toHaveCount(0);
  });

  test('driver earnings show the golden-path delivery at the personal 25% rate', async ({
    page,
  }) => {
    await loginAs(page, DRIVER1_PHONE, '/driver');
    await page.goto('/driver/earnings');
    // 100,000 LBP × (1 − 25%) from 04-golden-path
    await expect(page.getByText('75,000 LBP').first()).toBeVisible();
    await expect(page.getByText('Delivered').first()).toBeVisible();
  });

  test('driver profile renders identity', async ({ page }) => {
    await loginAs(page, DRIVER1_PHONE, '/driver');
    await page.goto('/driver/profile');
    await expect(page.getByText('E2E Driver', { exact: true })).toBeVisible();
    await expect(page.getByText('71 999 888')).toBeVisible();
  });

  test('vendor stats aggregate the run', async ({ page }) => {
    await loginAs(page, VENDOR, '/vendor');
    await page.goto('/vendor/stats');
    await expect(page.getByText('By status')).toBeVisible();
    await expect(page.getByText('Delivered volume')).toBeVisible();
    // At least the golden-path delivery is in the totals.
    await expect(page.getByText('100,000 LBP').first()).toBeVisible();
  });

  test('admin dashboard reflects the delivered order and its commission', async ({ page }) => {
    await loginAs(page, ADMIN, '/admin');
    // golden path delivered 100,000 LBP at 25% → 25,000 platform commission
    await expect(page.getByText('25,000 LBP').first()).toBeVisible();
    await expect(page.getByText('This week by status')).toBeVisible();
  });

  test('PWA surface: manifest and offline page are served', async ({ page }) => {
    const manifest = await page.request.get('/manifest.webmanifest');
    expect(manifest.status()).toBe(200);
    const body = (await manifest.json()) as { name: string; display: string };
    expect(body.name).toBe('Loadless');
    expect(body.display).toBe('standalone');

    await loginAs(page, DRIVER1_PHONE, '/driver');
    await page.goto('/offline');
    await expect(page.getByText("You're offline")).toBeVisible();
  });
});
