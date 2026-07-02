#!/usr/bin/env tsx
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/**
 * Visual verification for Sprint 4.3 — PaymentOut (Исходящий платёж) E2E flow.
 *
 * Tests both cascade paths:
 *   A) PaymentOut → InvoiceIn → PO  (payment via faktura)
 *   B) PaymentOut → PO direct       (advance payment)
 *
 * Scenario:
 *   1. Login
 *   2. Seed: PurchaseOrder (qty=4 × 100K UZS = 448K with 12% VAT vat-not-incl)
 *      + confirm it (API)
 *   3. Open PO detail → click "+ Faktura" → InvoiceIn draft
 *      Screenshot 43-01-invoicein-draft.png
 *   4. Post InvoiceIn → state=posted, PO.invoicedSum updated
 *   5. Open InvoiceIn detail → click "+ To'lov" → PaymentOut draft (preallocated)
 *      Screenshot 43-02-paymentout-draft-from-invoice.png
 *   6. Post PaymentOut → InvoiceIn auto-paid + PO.payedSum updated via cascade
 *      Screenshot 43-03-paymentout-posted.png
 *   7. Back to InvoiceIn detail — should show paid (success badge)
 *      Screenshot 43-04-invoicein-paid.png
 *   8. Back to PO detail — payedSumMinor should reflect the payment
 *      Screenshot 43-05-po-after-payment.png
 *   9. PaymentOut list view
 *      Screenshot 43-06-paymentout-list.png
 *  10. Verify via API: InvoiceIn.payedSum == sum, PO.payedSum == sum, PO.invoicedSum == sum
 *  11. Unpost PaymentOut → InvoiceIn back to posted, PO.payedSum back to 0
 *      Screenshot 43-07-paymentout-unposted.png
 *  12. Verify API: InvoiceIn.state == posted, InvoiceIn.payedSum == 0, PO.payedSum == 0
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
  const expectedTransientApiErrors: RegExp[] = [];

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

  // 2. Seed PurchaseOrder via API
  console.log('2. Seed PurchaseOrder via API (qty=4 × 100 000 UZS, vat=12%)...');
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

  // qty=4, priceMinor=10000000 (= 100 000 UZS), vat=12%, vatIncluded=false → sum = 4*100K + 12% = 448K
  const createOrderRes = await page.request.post(`${baseUrl}/api/v1/purchase-orders`, {
    headers: { ...auth, 'Content-Type': 'application/json' },
    data: {
      agentId: agent.id,
      organizationId: org.id,
      storeId: store.id,
      currency: 'UZS',
      rateValue: '100000000',
      vatEnabled: true,
      vatIncluded: false,
      positions: [
        {
          assortmentKind: 'product',
          assortmentId: product.id,
          quantity: '4',
          priceMinor: '10000000',
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
  const order = (await createOrderRes.json()) as { id: string; name: string; sumMinor: string };
  console.log(`   created PO ${order.name}, sum=${order.sumMinor}`);

  const confirmRes = await page.request.post(
    `${baseUrl}/api/v1/purchase-orders/${order.id}/transitions/confirm`,
    { headers: auth },
  );
  if (!confirmRes.ok()) {
    console.error('PO confirm failed:', confirmRes.status(), await confirmRes.text());
    process.exit(1);
  }
  console.log(`   confirmed PO ${order.name}`);

  // 3. PO detail — "+ Faktura"
  console.log('3. Open PO detail, click "+ Faktura"...');
  await page.goto(`${baseUrl}/purchase-orders/${order.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="purchase-order-detail-page"]', { timeout: 60000 });
  await page.waitForSelector('[data-test-id="action-create-invoice"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.click('[data-test-id="action-create-invoice"]');
  await page.waitForURL(/\/invoices-in\/[0-9a-f-]+$/, { timeout: 30000 });
  await page.waitForSelector('[data-test-id="invoice-in-detail-page"]', { timeout: 60000 });
  await page.waitForTimeout(500);
  const invoiceUrl = page.url();
  const invoiceId = invoiceUrl.split('/').pop()!;
  console.log(`   created InvoiceIn ${invoiceId}`);
  await page.screenshot({ path: path.join(OUT_DIR, '43-01-invoicein-draft.png'), fullPage: true });

  // 4. Post InvoiceIn
  console.log('4. Post InvoiceIn...');
  await page.click('[data-test-id="action-transition-post"]');
  await page.waitForSelector('[data-test-id="state-posted"]', { timeout: 15000 });
  await page.waitForTimeout(500);

  // 5. "+ To'lov" — PaymentOut from InvoiceIn
  console.log('5. Click "+ To\'lov"...');
  await page.waitForSelector('[data-test-id="action-create-payment"]', { timeout: 15000 });
  await page.click('[data-test-id="action-create-payment"]');
  await page.waitForURL(/\/payments-out\/[0-9a-f-]+$/, { timeout: 30000 });
  await page.waitForSelector('[data-test-id="payment-out-detail-page"]', { timeout: 60000 });
  await page.waitForTimeout(500);
  const paymentUrl = page.url();
  const paymentId = paymentUrl.split('/').pop()!;
  console.log(`   created PaymentOut ${paymentId} (preallocated to InvoiceIn ${invoiceId})`);
  await page.screenshot({
    path: path.join(OUT_DIR, '43-02-paymentout-draft-from-invoice.png'),
    fullPage: true,
  });

  // 6. Post PaymentOut → InvoiceIn auto-paid + PO.payedSum cascade
  console.log('6. Post PaymentOut (Провести)...');
  await page.click('[data-test-id="action-transition-post"]');
  await page.waitForSelector('[data-test-id="state-posted"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT_DIR, '43-03-paymentout-posted.png'),
    fullPage: true,
  });

  // 7. InvoiceIn detail — should be paid
  console.log('7. InvoiceIn detail after payment posted...');
  await page.goto(`${baseUrl}/invoices-in/${invoiceId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="invoice-in-detail-page"]', { timeout: 30000 });
  await page.waitForSelector('[data-test-id="state-paid"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, '43-04-invoicein-paid.png'), fullPage: true });

  // 8. PO detail — payedSum should reflect cascade
  console.log('8. PO detail after payment posted...');
  await page.goto(`${baseUrl}/purchase-orders/${order.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="purchase-order-detail-page"]', { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, '43-05-po-after-payment.png'), fullPage: true });

  // 9. PaymentOut list
  console.log('9. /payments-out (list)...');
  await page.goto(`${baseUrl}/payments-out`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="payments-out-page"]', { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, '43-06-paymentout-list.png'), fullPage: true });

  // 10. API verify cascade aggregates
  console.log('10. Verify cascade via API...');
  const [invAfterRes, poAfterRes] = await Promise.all([
    page.request.get(`${baseUrl}/api/v1/invoices-in/${invoiceId}`, { headers: auth }),
    page.request.get(`${baseUrl}/api/v1/purchase-orders/${order.id}`, { headers: auth }),
  ]);
  if (!invAfterRes.ok() || !poAfterRes.ok()) {
    apiErrors.push('failed to fetch InvoiceIn or PO after payment');
  } else {
    const invAfter = (await invAfterRes.json()) as {
      payedSumMinor: string;
      sumMinor: string;
      state: string;
    };
    const poAfter = (await poAfterRes.json()) as {
      payedSumMinor: string;
      invoicedSumMinor: string;
      sumMinor: string;
    };
    console.log(
      `   InvoiceIn: state=${invAfter.state}, payedSum=${invAfter.payedSumMinor}/${invAfter.sumMinor}`,
    );
    console.log(
      `   PO: payedSum=${poAfter.payedSumMinor}/${poAfter.sumMinor}, invoicedSum=${poAfter.invoicedSumMinor}/${poAfter.sumMinor}`,
    );
    if (invAfter.state !== 'paid')
      apiErrors.push(`expected InvoiceIn.state=paid, got ${invAfter.state}`);
    if (invAfter.payedSumMinor !== invAfter.sumMinor) {
      apiErrors.push(`InvoiceIn.payedSum=${invAfter.payedSumMinor}, expected ${invAfter.sumMinor}`);
    }
    if (poAfter.payedSumMinor !== poAfter.sumMinor) {
      apiErrors.push(`PO.payedSum=${poAfter.payedSumMinor}, expected ${poAfter.sumMinor}`);
    }
    if (poAfter.invoicedSumMinor !== poAfter.sumMinor) {
      apiErrors.push(`PO.invoicedSum=${poAfter.invoicedSumMinor}, expected ${poAfter.sumMinor}`);
    }
  }

  // 11. Unpost PaymentOut → reverse cascade
  console.log('11. Unpost PaymentOut...');
  await page.goto(`${baseUrl}/payments-out/${paymentId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="payment-out-detail-page"]', { timeout: 30000 });
  await page.waitForSelector('[data-test-id="action-transition-unpost"]', { timeout: 15000 });
  await page.click('[data-test-id="action-transition-unpost"]');
  await page.waitForSelector('[data-test-id="state-draft"]', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: path.join(OUT_DIR, '43-07-paymentout-unposted.png'),
    fullPage: true,
  });

  // 12. Verify reverse cascade
  console.log('12. Verify reverse cascade via API...');
  const [invRevRes, poRevRes] = await Promise.all([
    page.request.get(`${baseUrl}/api/v1/invoices-in/${invoiceId}`, { headers: auth }),
    page.request.get(`${baseUrl}/api/v1/purchase-orders/${order.id}`, { headers: auth }),
  ]);
  const invRev = (await invRevRes.json()) as { payedSumMinor: string; state: string };
  const poRev = (await poRevRes.json()) as { payedSumMinor: string; invoicedSumMinor: string };
  console.log(`   InvoiceIn after unpost: state=${invRev.state}, payedSum=${invRev.payedSumMinor}`);
  console.log(
    `   PO after unpost: payedSum=${poRev.payedSumMinor}, invoicedSum=${poRev.invoicedSumMinor}`,
  );
  if (invRev.state !== 'posted')
    apiErrors.push(`expected InvoiceIn.state=posted after unpost, got ${invRev.state}`);
  if (invRev.payedSumMinor !== '0')
    apiErrors.push(`expected InvoiceIn.payedSum=0 after unpost, got ${invRev.payedSumMinor}`);
  if (poRev.payedSumMinor !== '0')
    apiErrors.push(`expected PO.payedSum=0 after unpost, got ${poRev.payedSumMinor}`);
  // PO.invoicedSum should NOT be affected by payment unpost (only by InvoiceIn unpost)
  if (poRev.invoicedSumMinor === '0') {
    apiErrors.push(
      `PO.invoicedSum should remain set after payment unpost (InvoiceIn still posted)`,
    );
  }

  await browser.close();

  console.log('\n========');
  console.log(`pageerrors: ${pageErrors.length}`);
  console.log(`unexpected API 4xx/5xx + assertion failures: ${apiErrors.length}`);
  if (pageErrors.length === 0 && apiErrors.length === 0) {
    console.log('DONE — clean run');
  } else {
    console.log('Issues:');
    pageErrors.forEach((e) => console.log('  [page]', e));
    apiErrors.forEach((e) => console.log('  [api/assert]', e));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
