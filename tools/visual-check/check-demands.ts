#!/usr/bin/env tsx
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Visual verification for Sprint 3.2a — Demand (Отгрузка) end-to-end flow.
 *
 * Prerequisite: Stock.allowNegativeStock=true (run
 *   tools/admin/enable-negative-stock.ts true
 * once before this script until Supply documents + Store admin UI exist).
 *
 * Scenario:
 *   1. Login
 *   2. Create CustomerOrder + confirm it (API)
 *   3. Screenshot CO detail showing "+ Отгрузка" primary action
 *   4. Click the action → redirects to /demands/:newId detail (draft)
 *   5. Screenshot Demand detail + demands list
 *   6. Click "Провести" → state=posted, CO auto-transitions
 *   7. Screenshot posted Demand + updated CO detail (fully_shipped)
 *   8. Try Unpost → back to draft, CO back to confirmed
 *   9. Screenshot unposted states
 */
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../.screenshots');

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors: string[] = [];
  page.on('pageerror', (e) => {
    console.log('[ERR]', e.message);
    errors.push(e.message);
  });
  page.on('response', (r) => {
    if (r.url().includes('/api/v1/') && r.status() >= 400) {
      console.log(`[API ${r.status()}]`, r.request().method(), r.url());
      errors.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    }
  });

  // 1. Login
  console.log('1. Login...');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-test-id="login-email"]', { timeout: 60000 });
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('[data-test-id="login-submit"]');
  // Dev-mode Next.js can take a while to compile the dashboard on first hit;
  // allow up to 60s.
  await page.waitForURL(/\/$/, { timeout: 60000 });

  // 2. Create + confirm CO via API
  console.log('2. Seed CustomerOrder via API...');
  const loginRes = await page.request.post(`${baseUrl}/api/v1/auth/login`, {
    data: { email: 'admin@demo.local', password: 'admin123' },
  });
  const { accessToken } = (await loginRes.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const [agentsRes, orgsRes, storesRes, productsRes] = await Promise.all([
    page.request.get(`${baseUrl}/api/v1/counterparties?limit=1`, { headers: auth }),
    page.request.get(`${baseUrl}/api/v1/organizations?limit=1`, { headers: auth }),
    page.request.get(`${baseUrl}/api/v1/stores?limit=1`, { headers: auth }),
    page.request.get(`${baseUrl}/api/v1/products?limit=1`, { headers: auth }),
  ]);
  const agent = (await agentsRes.json()).items[0];
  const org = (await orgsRes.json()).items[0];
  const store = (await storesRes.json()).items[0];
  const product = (await productsRes.json()).items[0];
  console.log(
    `   refs: agent=${agent.name} org=${org.name} store=${store.name} product=${product.name}`,
  );

  const createOrderRes = await page.request.post(`${baseUrl}/api/v1/customer-orders`, {
    headers: { ...auth, 'Content-Type': 'application/json' },
    data: {
      agentId: agent.id,
      organizationId: org.id,
      storeId: store.id,
      currency: 'UZS',
      rateValue: '100000000',
      vatEnabled: true,
      vatIncluded: true,
      positions: [
        {
          assortmentKind: 'product',
          assortmentId: product.id,
          quantity: '3',
          priceMinor: '15000000',
          discount: '0',
          vat: 12,
          vatEnabled: true,
        },
      ],
    },
  });
  if (!createOrderRes.ok()) {
    console.error('CO create failed:', createOrderRes.status(), await createOrderRes.text());
    process.exit(1);
  }
  const order = (await createOrderRes.json()) as { id: string; name: string };
  console.log(`   created CO ${order.name}`);

  await page.request.post(`${baseUrl}/api/v1/customer-orders/${order.id}/transitions/confirmed`, {
    headers: auth,
  });

  // 3. CO detail with "+ Отгрузка"
  console.log('3. /customer-orders/:id (confirmed) — "+ Отгрузка" visible...');
  await page.goto(`${baseUrl}/customer-orders/${order.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="customer-order-detail-page"]', { timeout: 15000 });
  await page.waitForSelector('[data-test-id="action-create-demand"]', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, '32-01-co-confirmed.png'), fullPage: true });

  // 4. Click "+ Отгрузка"
  console.log('4. Click "+ Отгрузка"...');
  await page.click('[data-test-id="action-create-demand"]');
  await page.waitForURL(/\/demands\/[0-9a-f-]+$/, { timeout: 10000 });
  await page.waitForSelector('[data-test-id="demand-detail-page"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  const demandUrl = page.url();
  const demandId = demandUrl.split('/').pop()!;
  console.log(`   landed on /demands/${demandId}`);
  await page.screenshot({ path: path.join(OUT_DIR, '32-02-demand-draft.png'), fullPage: true });

  // 5. Demands list
  console.log('5. /demands (list)...');
  await page.goto(`${baseUrl}/demands`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="demands-page"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '32-03-demands-list.png'), fullPage: true });

  // 6. Provesti (post) the demand
  console.log('6. Post Demand (Провести)...');
  await page.goto(`${baseUrl}/demands/${demandId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="action-transition-post"]', { timeout: 15000 });
  await page.click('[data-test-id="action-transition-post"]');
  await page.waitForSelector('[data-test-id="state-posted"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, '32-04-demand-posted.png'), fullPage: true });

  // 7. Check CO auto-transitioned to fully_shipped
  console.log('7. Check CO auto-transitioned to fully_shipped...');
  await page.goto(`${baseUrl}/customer-orders/${order.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="customer-order-detail-page"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  const coState = await page.locator('[data-test-id^="state-"]').getAttribute('data-test-id');
  console.log(`   CO state: ${coState}`);
  await page.screenshot({ path: path.join(OUT_DIR, '32-05-co-fully-shipped.png'), fullPage: true });

  // 8. Unpost demand
  console.log('8. Unpost Demand (Снять проведение)...');
  await page.goto(`${baseUrl}/demands/${demandId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="action-transition-unpost"]', { timeout: 15000 });
  await page.click('[data-test-id="action-transition-unpost"]');
  await page.waitForSelector('[data-test-id="state-draft"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, '32-06-demand-unposted.png'), fullPage: true });

  // 9. Verify CO back to confirmed
  console.log('9. Check CO reverted to confirmed...');
  await page.goto(`${baseUrl}/customer-orders/${order.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="customer-order-detail-page"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  const coStateAfter = await page.locator('[data-test-id^="state-"]').getAttribute('data-test-id');
  console.log(`   CO state after unpost: ${coStateAfter}`);
  await page.screenshot({
    path: path.join(OUT_DIR, '32-07-co-back-to-confirmed.png'),
    fullPage: true,
  });

  await browser.close();
  console.log('\n========');
  if (errors.length === 0) {
    console.log('✅ DONE — no page errors, no API 4xx/5xx');
  } else {
    console.log(`⚠️  ${errors.length} issue(s):`);
    errors.forEach((e) => console.log('  -', e));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
