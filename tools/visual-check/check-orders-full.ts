#!/usr/bin/env tsx
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Visual verification for Sprint 3.1b — CustomerOrder end-to-end flow.
 *
 * Captures screenshots of:
 *   - /login
 *   - / (dashboard after login)
 *   - /customer-orders (list, empty)
 *   - /customer-orders/new (create form, all pickers)
 *   - (creates order via UI) -> /customer-orders/:id (detail with FSM buttons)
 *
 * Reports any pageerror or API 4xx/5xx along the way.
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
  await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: path.join(OUT_DIR, '31b-01-login.png') });
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('[data-test-id="login-submit"]');
  await page.waitForURL(/\/$/, { timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT_DIR, '31b-02-dashboard.png') });

  // 2. Customer orders list
  console.log('2. /customer-orders (list)...');
  await page.goto(`${baseUrl}/customer-orders`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="customer-orders-page"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '31b-03-list.png'), fullPage: true });

  // 3. Create form
  console.log('3. /customer-orders/new (create form)...');
  await page.goto(`${baseUrl}/customer-orders/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="customer-order-new-page"]', { timeout: 15000 });
  await page.waitForTimeout(1500); // let pickers prefetch orgs/stores
  await page.screenshot({ path: path.join(OUT_DIR, '31b-04-new-empty.png'), fullPage: true });

  // 4. Detail page (need an existing order id). Create via API to get one.
  console.log('4. Create order via API and visit detail...');
  const loginRes = await page.request.post(`${baseUrl}/api/v1/auth/login`, {
    data: { email: 'admin@demo.local', password: 'admin123' },
  });
  const { accessToken } = (await loginRes.json()) as { accessToken: string };
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const [agents, orgs, stores, products] = await Promise.all([
    page.request.get(`${baseUrl}/api/v1/counterparties?limit=1`, { headers: authHeaders }),
    page.request.get(`${baseUrl}/api/v1/organizations?limit=1`, { headers: authHeaders }),
    page.request.get(`${baseUrl}/api/v1/stores?limit=1`, { headers: authHeaders }),
    page.request.get(`${baseUrl}/api/v1/products?limit=1`, { headers: authHeaders }),
  ]);

  const agent = (await agents.json()).items[0];
  const org = (await orgs.json()).items[0];
  const store = (await stores.json()).items[0];
  const product = (await products.json()).items[0];

  console.log(
    `   agent=${agent?.name} org=${org?.name} store=${store?.name} product=${product?.name}`,
  );

  if (!agent || !org || !store || !product) {
    console.log('   ⚠️  Seed data incomplete. Skipping detail screenshot.');
  } else {
    const createRes = await page.request.post(`${baseUrl}/api/v1/customer-orders`, {
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      data: {
        agentId: agent.id,
        organizationId: org.id,
        storeId: store.id,
        currency: 'UZS',
        rateValue: '1',
        vatEnabled: true,
        vatIncluded: true,
        positions: [
          {
            assortmentKind: 'product',
            assortmentId: product.id,
            quantity: '2',
            priceMinor: '10000000', // 100_000 UZS in tiyin
            discount: '0',
            vat: 12,
            vatEnabled: true,
          },
        ],
      },
    });
    if (!createRes.ok()) {
      const body = await createRes.text();
      console.log(`   ❌ create failed ${createRes.status()}: ${body}`);
    } else {
      const created = (await createRes.json()) as { id: string; name: string };
      console.log(`   ✅ created ${created.name} (${created.id})`);

      await page.goto(`${baseUrl}/customer-orders/${created.id}`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector('[data-test-id="customer-order-detail-page"]', { timeout: 15000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT_DIR, '31b-05-detail.png'), fullPage: true });

      // Revisit list (now non-empty)
      await page.goto(`${baseUrl}/customer-orders`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-test-id="customer-orders-page"]', { timeout: 15000 });
      await page.waitForTimeout(800);
      await page.screenshot({
        path: path.join(OUT_DIR, '31b-06-list-populated.png'),
        fullPage: true,
      });
    }
  }

  await browser.close();

  console.log('\n========');
  if (errors.length === 0) {
    console.log('✅ DONE — no page errors, no API 4xx/5xx.');
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
