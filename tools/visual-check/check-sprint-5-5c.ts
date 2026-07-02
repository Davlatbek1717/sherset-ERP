#!/usr/bin/env tsx
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Visual verification for Sprint 5.5c — column customization.
 *
 * Scenario:
 *   1. Login, navigate to /sales-returns
 *   2. Assert: column-customizer-trigger button present
 *   3. Click it → panel opens showing all column toggles
 *   4. Screenshot: 55c-01-customizer-open.png
 *   5. Uncheck 'positions' column → column header disappears from table
 *   6. Screenshot: 55c-02-column-hidden.png
 *   7. Reload page (localStorage should persist the hidden state)
 *   8. Assert: 'positions' column is still hidden after reload
 *   9. Click Reset → column reappears
 *  10. Screenshot: 55c-03-after-reset.png
 *  11. Smoke-test: other 3 list pages also have column-customizer-trigger
 */
import { type Page, chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../.screenshots');

async function loginViaUi(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-test-id="login-email"]', { timeout: 60000 });
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('[data-test-id="login-submit"]');
  await page.waitForURL((u) => !u.toString().includes('/login'), {
    timeout: 60000,
    waitUntil: 'commit',
  });
  await page.waitForTimeout(500);
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const pageErrors: string[] = [];
  page.on('pageerror', (e) => {
    console.log('[PAGE ERROR]', e.message);
    pageErrors.push(e.message);
  });

  console.log('1. Login...');
  await loginViaUi(page, baseUrl);

  console.log('2. Navigate to /sales-returns...');
  await page.goto(`${baseUrl}/sales-returns`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-test-id="sales-returns-page"]', { timeout: 20000 });

  const trigger = page.locator('[data-test-id="column-customizer-trigger"]');
  if ((await trigger.count()) === 0) throw new Error('column-customizer-trigger missing');

  console.log('3. Open customizer panel...');
  await trigger.click();
  await page.waitForSelector('[data-test-id="column-customizer-panel"]', { timeout: 5000 });
  await page.screenshot({ path: path.join(OUT_DIR, '55c-01-customizer-open.png'), fullPage: true });

  console.log('4. Toggle off the "positions" column...');
  const positionsToggle = page.locator('[data-test-id="column-toggle-positions"]');
  if ((await positionsToggle.count()) === 0) throw new Error('positions toggle missing');
  await positionsToggle.click();
  await page.waitForTimeout(400);
  // Close the popover so table is visible
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Verify header "Pos." (positions) no longer rendered
  const posHeaderCount = await page.locator('th:has-text("Pos.")').count();
  console.log('   "Pos." header count after hide:', posHeaderCount);
  if (posHeaderCount !== 0) throw new Error('positions column still visible after hide');
  await page.screenshot({ path: path.join(OUT_DIR, '55c-02-column-hidden.png'), fullPage: true });

  console.log('5. Reload + assert persistence...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-test-id="sales-returns-page"]', { timeout: 20000 });
  await page.waitForTimeout(500);
  const posAfterReload = await page.locator('th:has-text("Pos.")').count();
  console.log('   "Pos." after reload:', posAfterReload);
  if (posAfterReload !== 0)
    throw new Error('positions column reappeared after reload (persistence broken)');

  console.log('6. Click Reset → column reappears...');
  await page.locator('[data-test-id="column-customizer-trigger"]').click();
  await page.waitForSelector('[data-test-id="column-customizer-panel"]', { timeout: 5000 });
  await page.locator('[data-test-id="column-reset"]').click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const posAfterReset = await page.locator('th:has-text("Pos.")').count();
  console.log('   "Pos." after reset:', posAfterReset);
  if (posAfterReset === 0) throw new Error('positions column still hidden after reset');
  await page.screenshot({ path: path.join(OUT_DIR, '55c-03-after-reset.png'), fullPage: true });

  console.log('7. Smoke-test customizer on 3 other list pages...');
  for (const slug of ['demands', 'moves', 'counterparties']) {
    await page.goto(`${baseUrl}/${slug}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(500);
    const c = await page.locator('[data-test-id="column-customizer-trigger"]').count();
    if (c === 0) throw new Error(`${slug}: customizer trigger missing`);
    console.log(`   ✓ ${slug} has column-customizer-trigger`);
  }

  await browser.close();
  if (pageErrors.length > 0) {
    pageErrors.forEach((e) => console.error(' ', e));
    process.exit(1);
  }
  console.log('\n✅ Sprint 5.5c visual check PASSED');
}

main().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
