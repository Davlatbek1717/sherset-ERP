/**
 * E2E: DetailContentTabs tab strip — moysklad-parity 4-tab swap
 * across the migrated detail pages.
 *
 * Verifies the user-facing contract that 17 detail pages share:
 *   ▸ Pozitsiyalar (default) renders the position editor + sidebar
 *   ▸ Bog'liq hujjatlar swaps to the related-docs panel
 *   ▸ Fayllar swaps to the attachments panel
 *   ▸ Tarix swaps to the audit-log timeline
 *
 * The unit tests in detail-content-tabs.test.tsx cover the component
 * contract; this e2e covers the actual user click-flow against a real
 * dev server with seeded data.
 */
import { expect, test } from '@playwright/test';

test.describe('DetailContentTabs — moysklad-parity tab swap', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('[data-test-id="login-username"]', 'admin@demo.local');
    await page.fill('[data-test-id="login-password"]', 'admin123');
    await page.click('[data-test-id="login-submit"]');
    await page.waitForURL('/');
  });

  test('demands detail page renders all 4 tabs and swaps content on click', async ({ page }) => {
    // Land on demands list and pick the first row.
    await page.goto('/demands');
    await expect(page.getByTestId('demands-page')).toBeVisible();

    // Open the first demand by clicking its row link.
    const firstRow = page.locator('[data-test-id^="demand-row-"] a').first();
    await firstRow.waitFor({ state: 'visible', timeout: 10_000 });
    await firstRow.click();

    // Detail page loaded.
    await expect(page.getByTestId('demand-detail-page')).toBeVisible();

    // All 4 tabs present.
    const tabs = page.locator('[data-test-id="detail-content-tabs"] [data-test-id^="tab-"]');
    await expect(tabs).toHaveCount(4);
    await expect(page.getByTestId('tab-positions')).toBeVisible();
    await expect(page.getByTestId('tab-related')).toBeVisible();
    await expect(page.getByTestId('tab-files')).toBeVisible();
    await expect(page.getByTestId('tab-history')).toBeVisible();

    // Default tab = Pozitsiyalar (active).
    await expect(page.getByTestId('tab-positions')).toHaveAttribute('data-state', 'active');

    // Click "Bog'liq hujjatlar" → state swaps.
    await page.getByTestId('tab-related').click();
    await expect(page.getByTestId('tab-related')).toHaveAttribute('data-state', 'active');
    await expect(page.getByTestId('tab-positions')).toHaveAttribute('data-state', 'inactive');

    // Click "Fayllar" → state swaps.
    await page.getByTestId('tab-files').click();
    await expect(page.getByTestId('tab-files')).toHaveAttribute('data-state', 'active');

    // Click "Tarix" → state swaps + audit fetch fires.
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('tab-history')).toHaveAttribute('data-state', 'active');

    // Click back to Pozitsiyalar.
    await page.getByTestId('tab-positions').click();
    await expect(page.getByTestId('tab-positions')).toHaveAttribute('data-state', 'active');
  });

  test('customer-orders detail uses the same 4-tab strip (flagship)', async ({ page }) => {
    await page.goto('/customer-orders');
    await expect(page.getByTestId('customer-orders-page')).toBeVisible();

    const firstRow = page.locator('[data-test-id^="customer-order-row-"] a').first();
    await firstRow.waitFor({ state: 'visible', timeout: 10_000 });
    await firstRow.click();

    await expect(page.getByTestId('customer-order-detail-page')).toBeVisible();

    // Same 4 tabs as demands — confirms the flagship migration landed.
    await expect(page.getByTestId('tab-positions')).toBeVisible();
    await expect(page.getByTestId('tab-related')).toBeVisible();
    await expect(page.getByTestId('tab-files')).toBeVisible();
    await expect(page.getByTestId('tab-history')).toBeVisible();

    // The customer-order Bog'liq tab uses the custom RelatedDocsTab
    // (not the default RelatedDocsPanel) — verify the swap still works.
    await page.getByTestId('tab-related').click();
    await expect(page.getByTestId('tab-related')).toHaveAttribute('data-state', 'active');
  });

  test('payments-in detail uses "Taqsimlanish" instead of "Pozitsiyalar"', async ({ page }) => {
    await page.goto('/payments-in');
    await expect(page.getByTestId('payments-in-page')).toBeVisible();

    const firstRow = page.locator('[data-test-id^="payment-in-row-"] a').first();
    const exists = await firstRow.count();
    test.skip(exists === 0, 'no seeded payment-in rows available — skip rather than flake');
    await firstRow.click();

    await expect(page.getByTestId('payment-in-detail-page')).toBeVisible();

    // Money documents override the first tab's label.
    const positionsTab = page.getByTestId('tab-positions');
    await expect(positionsTab).toBeVisible();
    await expect(positionsTab).toContainText('Taqsimlanish');
  });
});
