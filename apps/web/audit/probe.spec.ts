import { expect, test } from '@playwright/test';

test('vendor orders date filter', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email or phone number').fill('vendor@gmail.com');
  await page.getByLabel('Password').fill('loadless');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/vendor');
  await page.waitForTimeout(1500);
  console.log('From field present:', await page.locator('#vo-from').count());
  console.log('To field present  :', await page.locator('#vo-to').count());
  await page.screenshot({ path: 'audit/shots/vendor-orders-filter.png' });

  // Narrow to a window that excludes everything, to prove it filters.
  await page.locator('#vo-from').fill('2020-01-01');
  await page.locator('#vo-to').fill('2020-01-31');
  await page.waitForTimeout(1200);
  console.log('empty-state shown:', await page.getByText('No orders in this date range').count());
  await page.screenshot({ path: 'audit/shots/vendor-orders-filter-empty.png' });
});
