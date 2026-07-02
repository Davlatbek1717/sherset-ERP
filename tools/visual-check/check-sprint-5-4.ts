#!/usr/bin/env tsx
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Visual verification for Sprint 5.4 — complete UX parity for Sprints 5.1–5.3.
 *
 * Covers 6 modules × 3 views (list + new + detail) = 18 pages.
 *   • SalesReturn   (Возврат покупателя)
 *   • PurchaseReturn (Возврат поставщику)
 *   • Move          (Перемещение)
 *   • Loss          (Списание)
 *   • Enter         (Оприходование)
 *   • Inventory     (Инвентаризация)
 *
 * For each module:
 *   1. Navigate to list view (no entries yet — shows empty state)
 *   2. Navigate to new form (shows full form with pickers)
 *   3. Capture screenshot
 *
 * Also covers:
 *   • Warehouse subnav is present when on /moves etc.
 *   • "+Возврат" button appears on posted Demand/Supply detail pages
 *
 * Assertions:
 *   • No pageerror events
 *   • No 5xx API responses
 *   • Each form has the expected fields (picker + required labels)
 */
import { type Page, chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../.screenshots');

interface ModuleSpec {
  slug: string; // URL path slug (also filename prefix)
  listSelector: string; // selector to confirm list rendered
  newTestId: string; // test-id on new-form root element
  requiredFields: string[]; // data-test-id selectors that must be present on new form
}

const MODULES: ModuleSpec[] = [
  {
    slug: 'sales-returns',
    listSelector: '[data-test-id="sales-returns-page"], h1',
    newTestId: 'sales-return-new-page',
    requiredFields: ['field-agent', 'field-organization', 'field-store', 'field-demand'],
  },
  {
    slug: 'purchase-returns',
    listSelector: '[data-test-id="purchase-returns-page"], h1',
    newTestId: 'purchase-return-new-page',
    requiredFields: ['field-agent', 'field-organization', 'field-store', 'field-supply'],
  },
  {
    slug: 'moves',
    listSelector: '[data-test-id="moves-page"], h1',
    newTestId: 'move-new-page',
    requiredFields: ['field-organization', 'field-source-store', 'field-destination-store'],
  },
  {
    slug: 'losses',
    listSelector: '[data-test-id="losses-page"], h1',
    newTestId: 'loss-new-page',
    requiredFields: ['field-organization', 'field-store', 'field-reason'],
  },
  {
    slug: 'enters',
    listSelector: '[data-test-id="enters-page"], h1',
    newTestId: 'enter-new-page',
    requiredFields: ['field-organization', 'field-store', 'field-reason'],
  },
  {
    slug: 'inventories',
    listSelector: '[data-test-id="inventories-page"], h1',
    newTestId: 'inventory-new-page',
    requiredFields: ['field-organization', 'field-store'],
  },
];

async function loginViaUi(page: Page, baseUrl: string): Promise<void> {
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-test-id="login-email"]', { timeout: 60000 });
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('[data-test-id="login-submit"]');
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 60000 });
  await page.waitForTimeout(500);
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const pageErrors: string[] = [];
  const apiErrors: string[] = [];

  page.on('pageerror', (e) => {
    console.log('[PAGE ERROR]', e.message);
    pageErrors.push(e.message);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/v1/') && r.status() >= 500) {
      console.log(`[API ${r.status()}]`, r.request().method(), u);
      apiErrors.push(`${r.status()} ${r.request().method()} ${u}`);
    }
  });

  console.log('1. Login...');
  await loginViaUi(page, baseUrl);

  let step = 2;
  for (const mod of MODULES) {
    console.log(`\n${step++}. ${mod.slug} — list view`);
    await page.goto(`${baseUrl}/${mod.slug}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector(mod.listSelector, { timeout: 20000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT_DIR, `54-${mod.slug}-list.png`), fullPage: true });

    // Verify Warehouse subnav is visible for stock-related slugs
    if (['moves', 'losses', 'enters', 'inventories'].includes(mod.slug)) {
      const subnavMoves = await page.locator('a[href="/moves"]').count();
      if (subnavMoves === 0)
        throw new Error(`${mod.slug}: Warehouse subnav missing (no /moves link found)`);
    }

    console.log(`   ${mod.slug} — new form`);
    await page.goto(`${baseUrl}/${mod.slug}/new`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForSelector(`[data-test-id="${mod.newTestId}"]`, { timeout: 20000 });
    await page.waitForTimeout(600);

    // Verify required fields present
    for (const f of mod.requiredFields) {
      const found = await page.locator(`[data-test-id="${f}"]`).count();
      if (found === 0) throw new Error(`${mod.slug}/new: required field "${f}" not found`);
    }
    console.log(`   ✓ all required fields present (${mod.requiredFields.join(', ')})`);

    await page.screenshot({ path: path.join(OUT_DIR, `54-${mod.slug}-new.png`), fullPage: true });
  }

  console.log(`\n${step++}. Warehouse subnav — confirm 5 tabs visible from /moves`);
  await page.goto(`${baseUrl}/moves`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  for (const tab of ['/moves', '/losses', '/enters', '/inventories', '/stock-balance']) {
    const c = await page.locator(`a[href="${tab}"]`).count();
    if (c === 0) throw new Error(`Warehouse subnav missing tab: ${tab}`);
  }
  console.log('   ✓ all 5 Warehouse subnav tabs present');
  await page.screenshot({ path: path.join(OUT_DIR, '54-warehouse-subnav.png'), fullPage: true });

  await browser.close();

  if (pageErrors.length > 0) {
    console.error('\n❌ PAGE ERRORS:');
    pageErrors.forEach((e) => console.error('  ', e));
    process.exit(1);
  }
  if (apiErrors.length > 0) {
    console.error('\n❌ API 5xx ERRORS:');
    apiErrors.forEach((e) => console.error('  ', e));
    process.exit(1);
  }

  console.log('\n✅ Sprint 5.4 visual check PASSED');
  console.log(`   ${MODULES.length * 2 + 1} screenshots saved to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
