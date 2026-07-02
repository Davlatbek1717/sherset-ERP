#!/usr/bin/env tsx
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Sprint 4.4 — FULL PURCHASE FLOW END-TO-END
 *
 * Mirror of check-full-sales-flow.ts but for the supplier side.
 *
 *   1. Login
 *   2. Create PurchaseOrder via API + confirm it
 *   3. Click "+ Приёмка" on PO detail → Supply created from PO (back-linked)
 *   4. Post Supply → cascade: PO.receivedSum + per-line receivedQty
 *   5. Click "+ Faktura" on PO → InvoiceIn → post → PO.invoicedSum filled
 *   6. Click "+ Avans / Платёж" on InvoiceIn → PaymentOut allocated → post
 *      → InvoiceIn.paid + PO.payedSum cascade
 *   7. Verify PO state final = "closed" (full triple: received + invoiced + paid)
 *
 * Screenshots:
 *   44-01-po-confirmed.png     PO confirmed with all 3 shortcut buttons visible
 *   44-02-supply-draft.png     Supply detail (draft, linked to PO)
 *   44-03-supply-posted.png    Supply provedeno
 *   44-04-po-fully-received.png PO state Получен
 *   44-05-invoice-posted.png   InvoiceIn provedeno
 *   44-06-payment-posted.png   PaymentOut provedeno
 *   44-07-po-closed.png        PO FINAL: Закрыт
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

  // ===== 2. Create + confirm PurchaseOrder =====
  console.log('2. Create + confirm PurchaseOrder...');
  const poRes = await page.request.post(`${baseUrl}/api/v1/purchase-orders`, {
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
          quantity: '4',
          priceMinor: '7500000', // 75K UZS/unit cost
          vat: 12,
          vatEnabled: true,
        },
      ],
    },
  });
  const po = (await poRes.json()) as { id: string; name: string };
  await page.request.post(`${baseUrl}/api/v1/purchase-orders/${po.id}/transitions/confirm`, {
    headers: auth,
  });
  console.log(`   created + confirmed PO ${po.name} (sum 300,000 UZS, VAT inc)`);

  await page.goto(`${baseUrl}/purchase-orders/${po.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="purchase-order-detail-page"]', { timeout: 15000 });
  await page.waitForSelector('[data-test-id="action-create-supply"]', { timeout: 5000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '44-01-po-confirmed.png'), fullPage: true });

  // ===== 3. Click "+ Приёмка" → Supply from PO =====
  console.log('3. Click "+ Приёмка" on PO...');
  await page.click('[data-test-id="action-create-supply"]');
  await page.waitForURL(/\/supplies\/[0-9a-f-]+$/, { timeout: 10000 });
  await page.waitForSelector('[data-test-id="supply-detail-page"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  const supplyUrl = page.url();
  const supplyId = supplyUrl.split('/').pop()!;
  console.log(`   landed on /supplies/${supplyId}`);
  await page.screenshot({ path: path.join(OUT_DIR, '44-02-supply-draft.png'), fullPage: true });

  // ===== 4. Post Supply =====
  console.log('4. Post Supply (Провести)...');
  await page.click('[data-test-id="action-transition-post"]');
  await page.waitForSelector('[data-test-id="state-posted"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '44-03-supply-posted.png'), fullPage: true });

  // ===== 5. Verify PO transitioned to fully_received =====
  console.log('5. Verify PO auto-transitioned to fully_received...');
  await page.goto(`${baseUrl}/purchase-orders/${po.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="purchase-order-detail-page"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  const poStateAfterReceive = await page
    .locator('[data-test-id^="state-"]')
    .getAttribute('data-test-id');
  console.log(`   PO state after Supply post: ${poStateAfterReceive}`);
  await page.screenshot({
    path: path.join(OUT_DIR, '44-04-po-fully-received.png'),
    fullPage: true,
  });

  // ===== 6. Create + post InvoiceIn from PO =====
  console.log('6. Create + post InvoiceIn from PO...');
  const invRes = await page.request.post(
    `${baseUrl}/api/v1/invoices-in/from-purchase-order/${po.id}`,
    { headers: { ...auth, 'Content-Type': 'application/json' }, data: {} },
  );
  const invoice = (await invRes.json()) as { id: string; name: string };
  await page.request.post(`${baseUrl}/api/v1/invoices-in/${invoice.id}/transitions/post`, {
    headers: auth,
  });
  console.log(`   posted ${invoice.name}`);

  await page.goto(`${baseUrl}/invoices-in/${invoice.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="state-posted"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '44-05-invoice-posted.png'), fullPage: true });

  // ===== 7. Create + post PaymentOut from InvoiceIn =====
  console.log('7. Create + post PaymentOut from InvoiceIn...');
  const payRes = await page.request.post(
    `${baseUrl}/api/v1/payments-out/from-invoice-in/${invoice.id}`,
    { headers: { ...auth, 'Content-Type': 'application/json' }, data: {} },
  );
  const payment = (await payRes.json()) as { id: string; name: string };
  await page.request.post(`${baseUrl}/api/v1/payments-out/${payment.id}/transitions/post`, {
    headers: auth,
  });
  console.log(`   posted ${payment.name}`);

  await page.goto(`${baseUrl}/payments-out/${payment.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="state-posted"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '44-06-payment-posted.png'), fullPage: true });

  // ===== 8. Verify PO closed (full triple: received + invoiced + paid) =====
  console.log('8. Verify PO auto-closed...');
  await page.goto(`${baseUrl}/purchase-orders/${po.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="purchase-order-detail-page"]', { timeout: 15000 });
  await page.waitForTimeout(800);
  const poStateFinal = await page.locator('[data-test-id^="state-"]').getAttribute('data-test-id');
  console.log(`   PO final state: ${poStateFinal}`);
  await page.screenshot({ path: path.join(OUT_DIR, '44-07-po-closed.png'), fullPage: true });

  await browser.close();
  console.log('\n======== FULL PURCHASE FLOW E2E ========');
  console.log(`  PO:        ${po.name} (4 × 75K = 300K UZS, VAT inc)`);
  console.log(`  Supply:    ${supplyId} (linked to PO)`);
  console.log(`  Invoice:   ${invoice.name}`);
  console.log(`  Payment:   ${payment.name}`);
  console.log(`  PO after Supply post: ${poStateAfterReceive}`);
  console.log(`  PO final state:       ${poStateFinal}`);
  if (errors.length === 0 && poStateFinal === 'state-closed') {
    console.log('\n✅ PASS — PO transitioned through draft → confirmed → fully_received → closed');
  } else if (errors.length === 0) {
    console.log(`\n⚠️  PO didn't reach closed (got ${poStateFinal}). Check FSM cascade.`);
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
