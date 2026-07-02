#!/usr/bin/env tsx
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Visual verification for Sprint 5.5b — Related docs + History tab on detail pages.
 *
 * Scenario:
 *   1. Login + seed a posted sales-return (so it has audit entries for create+post).
 *   2. Open /sales-returns/{id}
 *   3. Assert: document-tabs + tab-related + tab-history testIds present
 *   4. Switch to History tab → timeline shows at least 1 audit entry
 *   5. Screenshots: 55b-01-related-tab.png, 55b-02-history-tab.png
 *   6. Smoke-test DocumentTabs presence on 4 more detail pages
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
  return ((await res.json()) as { accessToken: string }).accessToken;
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
      apiErrors.push(`${r.status()} ${r.request().method()} ${u}`);
    }
  });

  console.log('1. Login...');
  await loginViaUi(page, baseUrl);
  const token = await apiLogin(page, baseUrl);
  const authHeader = { Authorization: `Bearer ${token}` };

  console.log('2. Seed a posted sales-return...');
  const orgs = (await (
    await page.request.get(`${apiUrl}/organizations`, { headers: authHeader })
  ).json()) as { items: Array<{ id: string }> };
  const stores = (await (
    await page.request.get(`${apiUrl}/stores`, { headers: authHeader })
  ).json()) as { items: Array<{ id: string }> };
  const cp = (await (
    await page.request.get(`${apiUrl}/counterparties?limit=1`, { headers: authHeader })
  ).json()) as { items: Array<{ id: string }> };
  const pr = (await (
    await page.request.get(`${apiUrl}/products?limit=1`, { headers: authHeader })
  ).json()) as { items: Array<{ id: string }> };

  const create = await page.request.post(`${apiUrl}/sales-returns`, {
    headers: authHeader,
    data: {
      agentId: cp.items[0]!.id,
      organizationId: orgs.items[0]!.id,
      storeId: stores.items[0]!.id,
      reason: 'Sprint 5.5b history test',
      positions: [
        {
          assortmentKind: 'product',
          assortmentId: pr.items[0]!.id,
          quantity: '1',
          priceMinor: '100000',
          vat: 12,
          vatEnabled: true,
        },
      ],
    },
  });
  if (!create.ok()) throw new Error(`Seed failed: ${create.status()} ${await create.text()}`);
  const sr = (await create.json()) as { id: string; name: string };
  console.log(`   seeded SR ${sr.name} (${sr.id})`);

  console.log('3. Navigate to the detail page...');
  await page.goto(`${baseUrl}/sales-returns/${sr.id}`, {
    waitUntil: 'networkidle',
    timeout: 60000,
  });
  await page.waitForSelector('[data-test-id="sales-return-detail-page"]', { timeout: 20000 });
  await page.waitForSelector('[data-test-id="document-tabs"]', { timeout: 10000 });
  await page.waitForTimeout(400);

  console.log('4. Verify Related tab is default + screenshot...');
  const relatedTab = page.locator('[data-test-id="tab-related"]').first();
  const historyTab = page.locator('[data-test-id="tab-history"]').first();
  if ((await relatedTab.count()) === 0 || (await historyTab.count()) === 0) {
    throw new Error('Related or History tab button missing');
  }
  await relatedTab.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, '55b-01-related-tab.png'), fullPage: true });

  console.log('5. Switch to History tab + assert at least 1 entry...');
  await historyTab.click();
  await page.waitForTimeout(800);
  const entryCount = await page.locator('[data-test-id^="history-entry-"]').count();
  console.log('   history entries:', entryCount);
  if (entryCount === 0) throw new Error('History tab: no audit entries rendered (expected >= 1)');
  await page.screenshot({ path: path.join(OUT_DIR, '55b-02-history-tab.png'), fullPage: true });

  console.log('6. Smoke-test DocumentTabs presence on 4 other detail pages...');
  // Seed one of each so we have something to open
  const demandList = (await (
    await page.request.get(`${apiUrl}/demands?limit=1`, { headers: authHeader })
  ).json()) as { items: Array<{ id: string }> };
  const supplyList = (await (
    await page.request.get(`${apiUrl}/supplies?limit=1`, { headers: authHeader })
  ).json()) as { items: Array<{ id: string }> };
  const coList = (await (
    await page.request.get(`${apiUrl}/customer-orders?limit=1`, { headers: authHeader })
  ).json()) as { items: Array<{ id: string }> };
  const cpList = (await (
    await page.request.get(`${apiUrl}/counterparties?limit=1`, { headers: authHeader })
  ).json()) as { items: Array<{ id: string }> };

  // Each slug maps to its DetailView testId (set when data is loaded), so we
  // wait for it before asserting DocumentTabs — avoids racing page hydration.
  const smokes: Array<{ slug: string; id?: string; pageTestId: string }> = [
    { slug: 'demands', id: demandList.items[0]?.id, pageTestId: 'demand-detail-page' },
    { slug: 'supplies', id: supplyList.items[0]?.id, pageTestId: 'supply-detail-page' },
    { slug: 'customer-orders', id: coList.items[0]?.id, pageTestId: 'customer-order-detail-page' },
    { slug: 'counterparties', id: cpList.items[0]?.id, pageTestId: 'counterparty-detail-page' },
  ];
  for (const s of smokes) {
    if (!s.id) {
      console.log(`   SKIP ${s.slug} (no seed)`);
      continue;
    }
    await page.goto(`${baseUrl}/${s.slug}/${s.id}`, { waitUntil: 'networkidle', timeout: 60000 });
    // Wait for the DetailView to render (gated on `data` being non-null).
    await page.waitForSelector(`[data-test-id="${s.pageTestId}"]`, { timeout: 20000 });
    await page.waitForSelector('[data-test-id="document-tabs"]', { timeout: 10000 });
    console.log(`   ✓ ${s.slug} has DocumentTabs`);
  }

  console.log('7. Clean up...');
  await page.request.delete(`${apiUrl}/sales-returns/${sr.id}`, { headers: authHeader });

  await browser.close();
  if (pageErrors.length > 0) {
    pageErrors.forEach((e) => console.error(' ', e));
    process.exit(1);
  }
  if (apiErrors.length > 0) {
    apiErrors.forEach((e) => console.error(' ', e));
    process.exit(1);
  }
  console.log('\n✅ Sprint 5.5b visual check PASSED');
}

main().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
