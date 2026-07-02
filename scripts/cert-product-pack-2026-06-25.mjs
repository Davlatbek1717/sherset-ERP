// LIVE CERT — product card «Упаковка» tab 1:1, on the local app (:3100).
// Proves: tab renders the moysklad columns (Наименование · Количество ·
// Ед.измерения · Тип кода · Штрихкод упаковки, NO ТАСНИФ column), inline-add via
// «⊕ Упаковка», and the new «Тип кода» (codeType) round-trips FE→API→DB→reload.
// Cleans up the test pack at the end. Asserts 0 console errors.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = 'http://localhost:3100';
const API = 'http://localhost:4000/api/v1';
const OUT = resolve(process.cwd(), 'docs/audits/product-pack-cert-2026-06-25');
mkdirSync(OUT, { recursive: true });
const out = { steps: [], consoleErrors: [] };
const ok = (m) => out.steps.push(`✓ ${m}`);
const bad = (m) => out.steps.push(`✗ ${m}`);

// 1. fetch a product id via the API (deterministic — avoids list-click flakiness)
const lr = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
});
const { accessToken } = await lr.json();
const pr = await fetch(`${API}/products?limit=1`, {
  headers: { authorization: `Bearer ${accessToken}` },
});
const pj = await pr.json();
const productId = pj.items?.[0]?.id;
if (!productId) {
  out.fatal = 'no product id from API';
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}
out.productId = productId;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const shot = (f) => page.screenshot({ path: resolve(OUT, f) }).catch(() => {});
page.on('console', (m) => {
  if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERROR: ${String(e).slice(0, 200)}`));

const openPackTab = async () => {
  await page.locator('[data-test-id="tab-packaging"]').click();
  await page.waitForTimeout(800);
};

try {
  // 2. login
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click();
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 }).catch(() => {});
    });
  ok(`logged in (url ${page.url().replace(BASE, '')})`);

  // 3. open the product card
  await page.goto(`${BASE}/products/${productId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="product-detail-widget"]').waitFor({ timeout: 70000 });
  ok('product card mounted');

  // 4. Упаковка tab — verify label shows a count «(N)»
  const tabText = (await page.locator('[data-test-id="tab-packaging"]').textContent())?.trim();
  out.tabText = tabText;
  if (/\(\d+\)/.test(tabText || '')) ok(`tab shows count: «${tabText}»`);
  else bad(`tab has no «(N)» count: «${tabText}»`);
  await openPackTab();
  await shot('01-pack-tab.png');

  // record initial pack count
  const initialRows = await page.locator('[data-test-id="pack-row"]').count();
  out.initialRows = initialRows;

  // 5. inline-add a pack
  await page.locator('[data-test-id="pack-add"]').click();
  await page.waitForTimeout(500);
  const afterAdd = await page.locator('[data-test-id="pack-row"]').count();
  if (afterAdd === initialRows + 1) ok(`«⊕ Упаковка» added a row (${initialRows}→${afterAdd})`);
  else bad(`add did not add exactly one row (${initialRows}→${afterAdd})`);

  // 6. verify the 1:1 columns exist on the new row, ТАСНИФ column absent
  const newRow = page.locator('[data-test-id="pack-row"]').last();
  const hasCodeType = (await newRow.locator('[data-test-id="pack-codetype"]').count()) > 0;
  const hasTasnif = (await newRow.locator('[data-test-id="pack-tasnif"]').count()) > 0;
  // NB the uom Combobox forwards testId as `data-testid` (not `data-test-id`).
  const hasUom = (await newRow.locator('[data-testid="pack-uom"]').count()) > 0;
  const hasBarcode = (await newRow.locator('[data-test-id="pack-barcode"]').count()) > 0;
  if (hasCodeType) ok('«Тип кода» column present'); else bad('«Тип кода» MISSING');
  if (!hasTasnif) ok('«Код упаковки ТАСНИФ» column absent (moysklad parity)');
  else bad('ТАСНИФ column still present (should be removed)');
  if (hasUom) ok('«Ед. измерения» control present'); else bad('uom control MISSING');
  if (hasBarcode) ok('«Штрихкод упаковки» control present'); else bad('barcode control MISSING');

  // 7. fill the row (name + qty + codeType=code128 + barcode)
  const stamp = `CERT-${productId.slice(0, 4)}`;
  await newRow.locator('[data-test-id="pack-name"]').fill(`${stamp} Коробка`);
  await newRow.locator('[data-test-id="pack-qty"]').fill('12');
  await newRow.locator('[data-test-id="pack-codetype"]').selectOption('code128');
  await newRow.locator('[data-test-id="pack-barcode"]').fill('4600000000017');
  await shot('02-pack-filled.png');
  ok('filled new pack (name/qty=12/codeType=code128/barcode)');

  // 8. save
  await page.locator('[data-test-id="detail-toolbar-save"]').click();
  await page.waitForTimeout(4000); // save + invalidate + refetch
  ok('clicked Save');

  // 9. RELOAD → re-bootstrap auth via refresh cookie → verify persistence
  await page.goto(`${BASE}/products/${productId}`, { waitUntil: 'domcontentloaded' });
  if (page.url().endsWith('/login')) {
    // auth race: re-login then re-open
    await page.locator('[data-test-id="login-submit"]').click();
    await page.waitForTimeout(2500);
    await page.goto(`${BASE}/products/${productId}`, { waitUntil: 'domcontentloaded' });
  }
  await page.locator('[data-test-id="product-detail-widget"]').waitFor({ timeout: 70000 });
  await openPackTab();
  await page.waitForTimeout(800);
  await shot('03-after-reload.png');

  // find the persisted CERT row and read its codeType
  const rows = page.locator('[data-test-id="pack-row"]');
  const n = await rows.count();
  let certRow = null;
  for (let i = 0; i < n; i++) {
    const v = await rows.nth(i).locator('[data-test-id="pack-name"]').inputValue().catch(() => '');
    if (v.startsWith(stamp)) { certRow = rows.nth(i); break; }
  }
  if (!certRow) {
    bad('CERT pack NOT found after reload — did not persist');
  } else {
    const persistedCode = await certRow.locator('[data-test-id="pack-codetype"]').inputValue();
    const persistedQty = await certRow.locator('[data-test-id="pack-qty"]').inputValue();
    if (persistedCode === 'code128') ok(`codeType round-tripped: "${persistedCode}"`);
    else bad(`codeType did NOT round-trip: got "${persistedCode}" (expected code128)`);
    if (persistedQty === '12') ok(`qty round-tripped: "${persistedQty}"`);
    else bad(`qty mismatch: "${persistedQty}"`);

    // 10. cleanup — remove the CERT pack + save (restore DB)
    await certRow.locator('[data-test-id="pack-remove"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-test-id="detail-toolbar-save"]').click();
    await page.waitForTimeout(3500);
    ok('cleaned up CERT pack (removed + saved)');
  }
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-error.png');
} finally {
  out.consoleErrorCount = out.consoleErrors.length;
  out.PASS = out.steps.every((s) => s.startsWith('✓')) && out.consoleErrors.length === 0 && !out.error;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
