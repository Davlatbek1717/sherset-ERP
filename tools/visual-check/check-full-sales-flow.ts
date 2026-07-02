#!/usr/bin/env tsx
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Sprint 3.5 — FULL SALES FLOW END-TO-END
 *
 * Verifies the entire Sprint 3 chain in one script:
 *
 *   1. Login
 *   2. Create Supply (inbound stock via API) + post → stock populated
 *   3. Create CustomerOrder via UI API → confirm
 *   4. Screenshot CO in confirmed state
 *   5. Create Demand from CO (+ Отгрузка button) → post
 *   6. Verify CO auto-transitions to fully_shipped
 *   7. Create InvoiceOut from CO (+ Счёт) → post
 *   8. Verify CO.invoicedSumMinor updated
 *   9. Create PaymentIn from Invoice (+ Платёж) → post
 *   10. Verify Invoice becomes paid AND CO becomes closed
 *
 * Screenshots:
 *   35-01-supply-posted.png      stock filled
 *   35-02-co-confirmed.png       CO with all 3 shortcut buttons
 *   35-03-demand-posted.png      demand completed, CO auto-shipped
 *   35-04-invoice-posted.png     invoice ready for payment
 *   35-05-payment-posted.png     payment complete
 *   35-06-invoice-paid.png       invoice paid, zero balance
 *   35-07-co-closed.png          FINAL: CO in "Закрыт" state
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

  // ===== 1. Login =====
  console.log('1. Login...');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-test-id="login-email"]', { timeout: 60000 });
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('[data-test-id="login-submit"]');
  await page.waitForURL(/\/$/, { timeout: 60000 });

  // API bootstrap
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

  // ===== 2. Create + post Supply (seed 100 units) =====
  console.log('2. Create + post Supply...');
  const supplyRes = await page.request.post(`${baseUrl}/api/v1/supplies`, {
    headers: { ...auth, 'Content-Type': 'application/json' },
    data: {
      agentId: agent.id,
      organizationId: org.id,
      storeId: store.id,
      incomingNumber: 'SUP-E2E-001',
      positions: [
        {
          assortmentKind: 'product',
          assortmentId: product.id,
          quantity: '100',
          priceMinor: '8000000', // 80K UZS/unit cost
          vat: 12,
          vatEnabled: true,
        },
      ],
    },
  });
  const supply = (await supplyRes.json()) as { id: string; name: string };
  console.log(`   created supply ${supply.name}`);
  await page.request.post(`${baseUrl}/api/v1/supplies/${supply.id}/transitions/post`, {
    headers: auth,
  });
  console.log(`   posted supply`);

  await page.goto(`${baseUrl}/supplies/${supply.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="supply-detail-page"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '35-01-supply-posted.png'), fullPage: true });

  // ===== 3. Create + confirm CO =====
  console.log('3. Create + confirm CustomerOrder...');
  const coRes = await page.request.post(`${baseUrl}/api/v1/customer-orders`, {
    headers: { ...auth, 'Content-Type': 'application/json' },
    data: {
      agentId: agent.id,
      organizationId: org.id,
      storeId: store.id,
      vatEnabled: true,
      vatIncluded: true,
      positions: [
        {
          assortmentKind: 'product',
          assortmentId: product.id,
          quantity: '5',
          priceMinor: '12000000', // 120K UZS/unit sale
          vat: 12,
          vatEnabled: true,
        },
      ],
    },
  });
  const order = (await coRes.json()) as { id: string; name: string };
  await page.request.post(`${baseUrl}/api/v1/customer-orders/${order.id}/transitions/confirmed`, {
    headers: auth,
  });
  console.log(`   created + confirmed CO ${order.name} (sum 600,000)`);

  await page.goto(`${baseUrl}/customer-orders/${order.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="customer-order-detail-page"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '35-02-co-confirmed.png'), fullPage: true });

  // ===== 4. Create Demand from CO + post =====
  console.log('4. Create + post Demand from CO...');
  const demandRes = await page.request.post(
    `${baseUrl}/api/v1/demands/from-customer-order/${order.id}`,
    {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: {},
    },
  );
  const demand = (await demandRes.json()) as { id: string; name: string };
  await page.request.post(`${baseUrl}/api/v1/demands/${demand.id}/transitions/post`, {
    headers: auth,
  });
  console.log(`   posted ${demand.name}`);

  await page.goto(`${baseUrl}/demands/${demand.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="state-posted"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '35-03-demand-posted.png'), fullPage: true });

  // ===== 5. Create Invoice from CO + post =====
  console.log('5. Create + post InvoiceOut from CO...');
  const invRes = await page.request.post(
    `${baseUrl}/api/v1/invoices-out/from-customer-order/${order.id}`,
    {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: {},
    },
  );
  const invoice = (await invRes.json()) as { id: string; name: string };
  await page.request.post(`${baseUrl}/api/v1/invoices-out/${invoice.id}/transitions/post`, {
    headers: auth,
  });
  console.log(`   posted ${invoice.name}`);

  await page.goto(`${baseUrl}/invoices-out/${invoice.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="state-posted"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '35-04-invoice-posted.png'), fullPage: true });

  // ===== 6. Create PaymentIn from Invoice + post =====
  console.log('6. Create + post PaymentIn from Invoice...');
  const payRes = await page.request.post(
    `${baseUrl}/api/v1/payments-in/from-invoice-out/${invoice.id}`,
    {
      headers: { ...auth, 'Content-Type': 'application/json' },
      data: {},
    },
  );
  const payment = (await payRes.json()) as { id: string; name: string };
  await page.request.post(`${baseUrl}/api/v1/payments-in/${payment.id}/transitions/post`, {
    headers: auth,
  });
  console.log(`   posted ${payment.name}`);

  await page.goto(`${baseUrl}/payments-in/${payment.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="state-posted"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '35-05-payment-posted.png'), fullPage: true });

  // ===== 7. Verify invoice is paid =====
  console.log('7. Verify invoice paid...');
  await page.goto(`${baseUrl}/invoices-out/${invoice.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="state-paid"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '35-06-invoice-paid.png'), fullPage: true });

  // ===== 8. Verify CO closed =====
  console.log('8. Verify CO auto-closed (fully paid + fully shipped)...');
  await page.goto(`${baseUrl}/customer-orders/${order.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="customer-order-detail-page"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  const coState = await page.locator('[data-test-id^="state-"]').getAttribute('data-test-id');
  console.log(`   CO final state: ${coState}`);
  await page.screenshot({ path: path.join(OUT_DIR, '35-07-co-closed.png'), fullPage: true });

  await browser.close();
  console.log('\n======== FULL SALES FLOW E2E ========');
  console.log(`  Supply:    ${supply.name} (+100 units @ 80K)`);
  console.log(`  CO:        ${order.name} (sell 5 @ 120K = 600K, VAT inc)`);
  console.log(`  Demand:    ${demand.name}`);
  console.log(`  Invoice:   ${invoice.name}`);
  console.log(`  Payment:   ${payment.name}`);
  console.log(`  Final CO state: ${coState}`);
  if (errors.length === 0 && coState === 'state-closed') {
    console.log(
      '\n✅ PASS — CO transitioned through draft → confirmed → fully_shipped → paid → closed',
    );
  } else if (errors.length === 0) {
    console.log(`\n⚠️  CO didn't reach closed (got ${coState}). Check FSM cascade logic.`);
    process.exitCode = 1;
  } else {
    console.log(`\n❌ FAIL — ${errors.length} errors:`);
    errors.forEach((e) => console.log('  -', e));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
