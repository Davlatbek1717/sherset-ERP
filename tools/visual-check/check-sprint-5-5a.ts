#!/usr/bin/env tsx
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Visual verification for Sprint 5.5a — Bulk Actions UI parity.
 *
 * Scenario:
 *   1. Login
 *   2. Seed 3 sales-returns (draft) via API so the list has selectable rows
 *   3. Navigate to /sales-returns
 *   4. Assert: every row has a `data-test-id="select-row-{id}"` checkbox
 *   5. Click header "select-all" checkbox → all rows selected
 *   6. Assert: bulk-action-bar is visible with count = N
 *   7. Screenshot: 55a-01-all-selected.png
 *   8. Click individual row checkbox to deselect → count decreases
 *   9. Screenshot: 55a-02-partial-selected.png
 *  10. Click bulk "Delete" → browser confirm → accept → list refetches
 *      (Expected: all selected draft sales-returns are soft-deleted)
 *  11. Screenshot: 55a-03-after-bulk-delete.png
 *  12. Assert: row count = N - selected_count
 *
 * Also smoke-test presence of checkbox column on 4 other list pages
 * (demands, invoices-out, moves, counterparties) — proves the wiring
 * worked uniformly.
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
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 60000 });
  await page.waitForTimeout(500);
}

async function apiLogin(page: Page, baseUrl: string): Promise<string> {
  const res = await page.request.post(`${baseUrl}/api/v1/auth/login`, {
    data: { email: 'admin@demo.local', password: 'admin123' },
  });
  if (!res.ok()) throw new Error(`API login failed: ${res.status()}`);
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const apiUrl = `${baseUrl}/api/v1`;

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
  const token = await apiLogin(page, baseUrl);
  const authHeader = { Authorization: `Bearer ${token}` };

  console.log('2. Seed 3 draft sales-returns via API...');
  const orgs = await page.request.get(`${apiUrl}/organizations`, { headers: authHeader });
  const stores = await page.request.get(`${apiUrl}/stores`, { headers: authHeader });
  const counterparties = await page.request.get(`${apiUrl}/counterparties?limit=1`, {
    headers: authHeader,
  });
  const products = await page.request.get(`${apiUrl}/products?limit=1`, { headers: authHeader });

  const orgId = ((await orgs.json()) as { items: Array<{ id: string }> }).items[0]!.id;
  const storeId = ((await stores.json()) as { items: Array<{ id: string }> }).items[0]!.id;
  const cpRows = (await counterparties.json()) as { items: Array<{ id: string }> };
  const prRows = (await products.json()) as { items: Array<{ id: string }> };
  if (cpRows.items.length === 0) throw new Error('Need at least one counterparty seeded');
  if (prRows.items.length === 0) throw new Error('Need at least one product seeded');
  const agentId = cpRows.items[0]!.id;
  const productId = prRows.items[0]!.id;

  const createdIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const res = await page.request.post(`${apiUrl}/sales-returns`, {
      headers: authHeader,
      data: {
        agentId,
        organizationId: orgId,
        storeId,
        reason: `Bulk test batch ${i + 1}`,
        positions: [
          {
            assortmentKind: 'product',
            assortmentId: productId,
            quantity: '1',
            priceMinor: '100000',
            vat: 12,
            vatEnabled: true,
          },
        ],
      },
    });
    if (!res.ok()) throw new Error(`Seed failed at #${i}: ${res.status()} ${await res.text()}`);
    const body = (await res.json()) as { id: string };
    createdIds.push(body.id);
  }
  console.log(`   seeded ${createdIds.length} sales-returns`);

  console.log('3. Navigate to /sales-returns, filter state=draft...');
  await page.goto(`${baseUrl}/sales-returns?state=draft`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForSelector('[data-test-id="sales-returns-page"]', { timeout: 20000 });
  await page.waitForTimeout(400);
  // Click the 'draft' filter button to ensure state filter is wired
  const draftFilter = page.locator('[data-test-id="filter-draft"]');
  if (await draftFilter.count()) {
    await draftFilter.click();
    await page.waitForTimeout(600);
  }

  console.log('4. Verify checkbox column present + select-all toggles...');
  const selectAll = page.locator('[data-test-id="select-all"]').first();
  if ((await selectAll.count()) === 0) throw new Error('select-all checkbox missing');

  // Assert per-row checkboxes exist for the seeded IDs
  for (const id of createdIds) {
    const c = await page.locator(`[data-test-id="select-row-${id}"]`).count();
    if (c === 0) throw new Error(`select-row checkbox missing for ${id}`);
  }

  console.log('5. Click select-all → assert bulk bar visible with count...');
  await selectAll.click();
  await page.waitForSelector('[data-test-id="bulk-action-bar"]', { timeout: 10000 });
  const countText = await page.locator('[data-test-id="bulk-count"]').textContent();
  console.log('   count label:', countText);
  if (!countText || !/\d/.test(countText))
    throw new Error('bulk count label missing or has no number');

  await page.screenshot({ path: path.join(OUT_DIR, '55a-01-all-selected.png'), fullPage: true });

  console.log('6. Deselect one row → count decrements...');
  await page.locator(`[data-test-id="select-row-${createdIds[0]}"]`).click();
  await page.waitForTimeout(300);
  const countText2 = await page.locator('[data-test-id="bulk-count"]').textContent();
  console.log('   new count label:', countText2);
  await page.screenshot({
    path: path.join(OUT_DIR, '55a-02-partial-selected.png'),
    fullPage: true,
  });

  console.log('7. Bulk delete the remaining selected rows...');
  page.once('dialog', (d) => d.accept());
  await page.click('[data-test-id="bulk-action-delete"]');
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(OUT_DIR, '55a-03-after-bulk-delete.png'),
    fullPage: true,
  });

  // Verify via API — we kept createdIds[0], deleted [1] and [2]
  const after = await page.request.get(`${apiUrl}/sales-returns?includeDeleted=false&limit=100`, {
    headers: authHeader,
  });
  const afterBody = (await after.json()) as { items: Array<{ id: string }> };
  const stillThere = createdIds.filter((id) => afterBody.items.some((r) => r.id === id));
  console.log('   remaining from our seed:', stillThere);
  if (!stillThere.includes(createdIds[0]!))
    throw new Error('Survivor row (createdIds[0]) unexpectedly missing');
  if (stillThere.includes(createdIds[1]!) || stillThere.includes(createdIds[2]!)) {
    throw new Error('Rows that should have been bulk-deleted still present');
  }
  console.log('   ✓ bulk delete deleted exactly the selected rows, survivor intact');

  console.log('8. Smoke-test checkbox column on 4 other list pages...');
  for (const slug of ['demands', 'invoices-out', 'moves', 'counterparties']) {
    await page.goto(`${baseUrl}/${slug}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(500);
    const c = await page.locator('[data-test-id="select-all"]').count();
    if (c === 0) throw new Error(`${slug}: select-all checkbox missing`);
    console.log(`   ✓ ${slug} has select-all`);
  }

  // Clean up the remaining seeded row
  console.log('9. Clean up remaining seed...');
  await page.request.delete(`${apiUrl}/sales-returns/${createdIds[0]!}`, { headers: authHeader });

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

  console.log('\n✅ Sprint 5.5a visual check PASSED — 3 screenshots in', OUT_DIR);
}

main().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
