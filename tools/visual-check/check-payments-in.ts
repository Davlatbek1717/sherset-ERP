#!/usr/bin/env tsx
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Visual verification for Sprint 3.4b — PaymentIn (Входящий платёж) +
 * InvoiceOut → paid FSM transition end-to-end.
 *
 * Scenario:
 *   1. Login (UI, so the web app has an auth cookie in the browser store)
 *   2. API-seed: CustomerOrder with 1 position
 *        (qty=2, priceMinor=25000000, vat=12, vatIncluded=true) + confirm it
 *   3. CO detail → click "+ Счёт" → new InvoiceOut (draft) opens
 *   4. Invoice detail → click "→ Провести" → state=posted
 *   5. Invoice detail (posted) → click "+ Платёж" → new PaymentIn (draft),
 *      full-invoice allocation populated. SCREENSHOT 34b-01-payment-draft.
 *   6. Payment detail → click "→ Провести" → state=posted.
 *      SCREENSHOT 34b-02-payment-posted.
 *   7. Reload invoice detail — state=paid, payedSumMinor=sumMinor.
 *      SCREENSHOT 34b-03-invoice-paid.
 *   8. Reload CO detail — payedSumMinor reflects the payment.
 *      SCREENSHOT 34b-04-co-with-payment.
 *   9. /payments-in list — 1 row with posted state.
 *      SCREENSHOT 34b-05-payments-list.
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

  const pageErrors: string[] = [];
  const apiErrors: string[] = [];
  const expectedTransientApiErrors: RegExp[] = [
    // No transient errors expected in this scenario.
  ];

  page.on('pageerror', (e) => {
    console.log('[PAGE ERROR]', e.message);
    pageErrors.push(e.message);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('/api/v1/') && r.status() >= 400) {
      const line = `${r.status()} ${r.request().method()} ${u}`;
      console.log(`[API ${r.status()}]`, r.request().method(), u);
      const isExpected = expectedTransientApiErrors.some((p) => p.test(line));
      if (!isExpected) apiErrors.push(line);
    }
  });

  // 1. Login via UI
  console.log('1. Login...');
  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('[data-test-id="login-email"]', { timeout: 60000 });
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('[data-test-id="login-submit"]');
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 60000 });
  await page.waitForTimeout(500);

  // 2. Seed CustomerOrder via API
  console.log('2. Seed CustomerOrder via API (qty=2 × 250 000 UZS, vat=12%, vatIncluded)...');
  const loginRes = await page.request.post(`${baseUrl}/api/v1/auth/login`, {
    data: { email: 'admin@demo.local', password: 'admin123' },
  });
  if (!loginRes.ok()) {
    console.error('API login failed:', loginRes.status(), await loginRes.text());
    process.exit(1);
  }
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

  // qty=2, priceMinor=25000000 (tiyin = 250 000 UZS), vat=12, vatIncluded=true
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
          quantity: '2',
          priceMinor: '25000000',
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

  const confirmRes = await page.request.post(
    `${baseUrl}/api/v1/customer-orders/${order.id}/transitions/confirmed`,
    { headers: auth },
  );
  if (!confirmRes.ok()) {
    console.error('CO confirm failed:', confirmRes.status(), await confirmRes.text());
    process.exit(1);
  }
  console.log(`   confirmed CO ${order.name}`);

  // 3. CO detail → click "+ Счёт"
  console.log('3. Open CO detail, click "+ Счёт"...');
  await page.goto(`${baseUrl}/customer-orders/${order.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="customer-order-detail-page"]', { timeout: 60000 });
  await page.waitForSelector('[data-test-id="action-create-invoice"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.click('[data-test-id="action-create-invoice"]');
  await page.waitForURL(/\/invoices-out\/[0-9a-f-]+$/, { timeout: 30000 });
  await page.waitForSelector('[data-test-id="invoice-out-detail-page"]', { timeout: 60000 });
  await page.waitForTimeout(800);
  const invoiceUrl = page.url();
  const invoiceId = invoiceUrl.split('/').pop()!;
  console.log(`   landed on /invoices-out/${invoiceId}`);

  // 4. Post the invoice
  console.log('4. Post invoice (Провести)...');
  await page.waitForSelector('[data-test-id="action-transition-post"]', { timeout: 15000 });
  await page.click('[data-test-id="action-transition-post"]');
  await page.waitForSelector('[data-test-id="state-posted"]', { timeout: 15000 });
  await page.waitForTimeout(500);

  // 5. Click "+ Платёж" → new PaymentIn in draft state with allocation
  console.log('5. Invoice (posted) → "+ Платёж" → new PaymentIn...');
  await page.waitForSelector('[data-test-id="action-create-payment"]', { timeout: 15000 });
  await page.click('[data-test-id="action-create-payment"]');
  await page.waitForURL(/\/payments-in\/[0-9a-f-]+$/, { timeout: 30000 });
  await page.waitForSelector('[data-test-id="payment-in-detail-page"]', { timeout: 60000 });
  await page.waitForSelector('[data-test-id="state-draft"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  const paymentUrl = page.url();
  const paymentId = paymentUrl.split('/').pop()!;
  console.log(`   landed on /payments-in/${paymentId}`);
  await page.screenshot({
    path: path.join(OUT_DIR, '34b-01-payment-draft.png'),
    fullPage: true,
  });

  // 6. Post the payment
  console.log('6. Post payment (Провести)...');
  await page.waitForSelector('[data-test-id="action-transition-post"]', { timeout: 15000 });
  await page.click('[data-test-id="action-transition-post"]');
  await page.waitForSelector('[data-test-id="state-posted"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT_DIR, '34b-02-payment-posted.png'),
    fullPage: true,
  });

  // 7. Reload invoice — expect state=paid, payedSumMinor=sumMinor
  console.log('7. Reload invoice detail — expect state=paid...');
  await page.goto(`${baseUrl}/invoices-out/${invoiceId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="invoice-out-detail-page"]', { timeout: 30000 });
  await page.waitForSelector('[data-test-id="state-paid"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT_DIR, '34b-03-invoice-paid.png'),
    fullPage: true,
  });

  // 8. Reload CO detail — payedSumMinor column should reflect payment
  console.log('8. Reload CO detail — payedSumMinor should reflect payment...');
  await page.goto(`${baseUrl}/customer-orders/${order.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="customer-order-detail-page"]', { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(OUT_DIR, '34b-04-co-with-payment.png'),
    fullPage: true,
  });

  // 9. /payments-in list — 1 row, posted
  console.log('9. /payments-in list...');
  await page.goto(`${baseUrl}/payments-in`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="payments-in-page"]', { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(OUT_DIR, '34b-05-payments-list.png'),
    fullPage: true,
  });

  await browser.close();

  console.log('\n========');
  console.log(`pageerrors: ${pageErrors.length}`);
  console.log(`unexpected API 4xx/5xx: ${apiErrors.length}`);
  if (pageErrors.length === 0 && apiErrors.length === 0) {
    console.log('DONE — clean run');
  } else {
    console.log('Issues:');
    pageErrors.forEach((e) => console.log('  [page]', e));
    apiErrors.forEach((e) => console.log('  [api]', e));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
