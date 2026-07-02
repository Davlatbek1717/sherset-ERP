/**
 * E2E: Product vertical slice
 *  1. Navigate to products list
 *  2. Create a new product
 *  3. Verify it appears in list
 *  4. Archive it
 *  5. Verify archived filter shows it
 *  6. Restore it
 *  7. Delete it
 */
import { expect, test } from '@playwright/test';

const uniqueCode = `TEST-${Date.now()}`;
const uniqueName = `Test Product ${Date.now()}`;

test.describe('Product vertical slice', () => {
  test('create → list → detail → archive → restore → delete', async ({ page }) => {
    // 1. Products list
    await page.goto('/products');
    await expect(page.getByTestId('products-page')).toBeVisible();

    // 2. Click create → new form
    await page.getByTestId('entity-create').click();
    await expect(page.getByTestId('product-new-page')).toBeVisible();
    await expect(page.getByTestId('product-form')).toBeVisible();

    // Fill form
    await page.getByTestId('field-name').fill(uniqueName);
    await page.getByTestId('field-code').fill(uniqueCode);
    await page.getByTestId('field-buyPrice').fill('1000000000'); // 10M tiyin = 100k UZS
    await page.getByTestId('field-salePrice').fill('1500000000'); // 15M tiyin = 150k UZS
    await page.getByTestId('field-vat').fill('12');
    await page.getByTestId('field-uom').fill('шт');

    await page.getByTestId('save-button').click();

    // 3. Should redirect to detail
    await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}/);
    await expect(page.getByTestId('product-detail-page')).toBeVisible();
    await expect(page.getByTestId('product-name')).toHaveText(uniqueName);

    // 4. Archive
    await page.getByTestId('archive-button').click();
    await expect(page.getByTestId('badge-archived')).toBeVisible();

    // 5. Back to list + check archive filter
    await page.goto('/products?archived=true');
    await page.getByTestId('filter-archived').click();
    const archivedRow = page.locator(`text=${uniqueName}`).first();
    await expect(archivedRow).toBeVisible({ timeout: 5000 });

    // 6. Open and restore
    await archivedRow.click();
    await page.getByTestId('restore-button').click();
    await expect(page.getByTestId('badge-archived')).not.toBeVisible({ timeout: 5000 });

    // 7. Delete (with confirm — auto-accept)
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByTestId('delete-button').click();

    // 8. Should be back on list, item gone
    await expect(page).toHaveURL('/products');
    await expect(page.locator(`text=${uniqueName}`)).not.toBeVisible();
  });

  test('validation: empty name shows error', async ({ page }) => {
    await page.goto('/products/new');
    await page.getByTestId('save-button').click();
    await expect(page.getByText('Nomi majburiy')).toBeVisible();
  });

  test('search filters products', async ({ page }) => {
    await page.goto('/products');
    await page.getByTestId('products-search').fill('NONEXISTENT-QUERY-XYZ');
    await expect(page.getByTestId('empty-state')).toBeVisible({ timeout: 3000 });
  });
});
