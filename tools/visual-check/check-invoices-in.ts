#!/usr/bin/env tsx
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Visual verification for Sprint 4.2 — InvoiceIn (Счёт поставщика) end-to-end flow.
 *
 * Mirror of check-invoices-out.ts but for the purchase side.
 *
 * Scenario:
 *   1. Login
 *   2. Seed: PurchaseOrder (qty=3, price=150K UZS, vat=12%, vatIncluded=true) + confirm it (API)
 *   3. Open PO detail, click "+ Faktura" → redirects to /invoices-in/:newId (draft)
 *      Screenshot 42-01-invoice-in-draft.png
 *   4. Screenshot /invoices-in list (42-02-invoice-in-list.png)
 *   5. Post invoice → state=posted, PO.invoicedSum updated
 *      Screenshot 42-03-invoice-in-posted.png
 *   6. Back to PO detail — "Fakturlashtirilgan" in Summa block reflects invoice
 *      Screenshot 42-04-po-after-invoice.png
 *   7. Unpost invoice → back to draft, PO.invoicedSum reverted
 *      Screenshot 42-05-invoice-in-unposted.png
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
    // None expected in this scenario; keep pattern empty to fail on any 4xx/5xx.
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

  // 2. Seed: create + confirm PurchaseOrder via API
  console.log('2. Seed PurchaseOrder via API (qty=3 × 150 000 UZS, vat=12%, vatIncluded)...');
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

  // qty=3, priceMinor=15000000 (tiyin = 150 000 UZS), vat=12, vatIncluded=true
  const createOrderRes = await page.request.post(`${baseUrl}/api/v1/purchase-orders`, {
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
    console.error('PO create failed:', createOrderRes.status(), await createOrderRes.text());
    process.exit(1);
  }
  const order = (await createOrderRes.json()) as { id: string; name: string };
  console.log(`   created PO ${order.name}`);

  const confirmRes = await page.request.post(
    `${baseUrl}/api/v1/purchase-orders/${order.id}/transitions/confirm`,
    { headers: auth },
  );
  if (!confirmRes.ok()) {
    console.error('PO confirm failed:', confirmRes.status(), await confirmRes.text());
    process.exit(1);
  }
  console.log(`   confirmed PO ${order.name}`);

  // 3. PO detail — click "+ Faktura"
  console.log('3. Open PO detail, click "+ Faktura"...');
  await page.goto(`${baseUrl}/purchase-orders/${order.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="purchase-order-detail-page"]', { timeout: 60000 });
  await page.waitForSelector('[data-test-id="action-create-invoice"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.click('[data-test-id="action-create-invoice"]');
  await page.waitForURL(/\/invoices-in\/[0-9a-f-]+$/, { timeout: 30000 });
  await page.waitForSelector('[data-test-id="invoice-in-detail-page"]', { timeout: 60000 });
  await page.waitForTimeout(800);
  const invoiceUrl = page.url();
  const invoiceId = invoiceUrl.split('/').pop()!;
  console.log(`   landed on /invoices-in/${invoiceId}`);
  await page.screenshot({ path: path.join(OUT_DIR, '42-01-invoice-in-draft.png'), fullPage: true });

  // 4. Invoices-in list
  console.log('4. /invoices-in (list)...');
  await page.goto(`${baseUrl}/invoices-in`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="invoices-in-page"]', { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '42-02-invoice-in-list.png'), fullPage: true });

  // 5. Post the invoice
  console.log('5. Post invoice (Провести)...');
  await page.goto(`${baseUrl}/invoices-in/${invoiceId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="invoice-in-detail-page"]', { timeout: 30000 });
  await page.waitForSelector('[data-test-id="action-transition-post"]', { timeout: 15000 });
  await page.click('[data-test-id="action-transition-post"]');
  await page.waitForSelector('[data-test-id="state-posted"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT_DIR, '42-03-invoice-in-posted.png'),
    fullPage: true,
  });

  // 6. PO detail — should reflect invoiced sum on "Fakturlashtirilgan" line
  console.log('6. PO detail after invoice posted...');
  await page.goto(`${baseUrl}/purchase-orders/${order.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="purchase-order-detail-page"]', { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, '42-04-po-after-invoice.png'), fullPage: true });

  // 7. Unpost the invoice — PO.invoicedSum reverts to 0
  console.log('7. Unpost invoice (Снять проведение)...');
  await page.goto(`${baseUrl}/invoices-in/${invoiceId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="invoice-in-detail-page"]', { timeout: 30000 });
  await page.waitForSelector('[data-test-id="action-transition-unpost"]', { timeout: 15000 });
  await page.click('[data-test-id="action-transition-unpost"]');
  await page.waitForSelector('[data-test-id="state-draft"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT_DIR, '42-05-invoice-in-unposted.png'),
    fullPage: true,
  });

  // Verify PO aggregate: GET PO detail, assert invoicedSumMinor === 0 again
  const poAfterRes = await page.request.get(`${baseUrl}/api/v1/purchase-orders/${order.id}`, {
    headers: auth,
  });
  if (!poAfterRes.ok()) {
    console.error('PO fetch after unpost failed:', poAfterRes.status());
    process.exit(1);
  }
  const poAfter = (await poAfterRes.json()) as { invoicedSumMinor: string };
  console.log(`   PO.invoicedSumMinor after unpost = ${poAfter.invoicedSumMinor}`);
  if (poAfter.invoicedSumMinor !== '0') {
    apiErrors.push(
      `PO.invoicedSumMinor expected '0' after unpost, got '${poAfter.invoicedSumMinor}'`,
    );
  }

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
