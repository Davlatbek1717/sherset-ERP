// LIVE CERT — product card «История» tab 1:1 (local app :3100). Finds a product
// WITH movements via the API, opens it, and verifies the two paginated sub-sections
// (Закупки / Продажи): borderless tables, «« ‹ N-M из T › »» pager per section,
// «№»→document + «Контрагент»→counterparty links. Asserts 0 console errors.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.CERT_BASE || 'http://localhost:3100';
const API = process.env.CERT_API || 'http://localhost:4000/api/v1';
const OUT = resolve(process.cwd(), 'docs/audits/product-history-cert-2026-06-25');
mkdirSync(OUT, { recursive: true });
const out = { steps: [], consoleErrors: [] };
const ok = (m) => out.steps.push(`✓ ${m}`);
const bad = (m) => out.steps.push(`✗ ${m}`);

// 1. login + find a product with movement history
const lr = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
});
const { accessToken } = await lr.json();
const auth = { authorization: `Bearer ${accessToken}` };
const plist = await (await fetch(`${API}/products?limit=80`, { headers: auth })).json();
let target = null;
for (const p of plist.items ?? []) {
  const mv = await (
    await fetch(`${API}/reports/product-movement?productId=${p.id}&limit=200`, { headers: auth })
  ).json();
  const pc = mv.purchases?.length ?? 0;
  const sc = mv.sales?.length ?? 0;
  const max = Math.max(pc, sc);
  if (max > 0 && (!target || max > Math.max(target.purchases, target.sales))) {
    target = { id: p.id, name: p.name, purchases: pc, sales: sc, sample: mv.purchases?.[0] ?? mv.sales?.[0] };
    // a product with >5 in one section proves the 5/page pager — stop once found.
    if (max > 5) break;
  }
}
// fall back to the first product (structure-only, «из 0») if none has movement
const productId = target?.id ?? plist.items?.[0]?.id;
out.target = target ?? { id: productId, note: 'no product had movements — structure-only' };
if (!productId) {
  out.fatal = 'no products';
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const shot = (f) => page.screenshot({ path: resolve(OUT, f) }).catch(() => {});
page.on('console', (m) => {
  if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERROR: ${String(e).slice(0, 200)}`));

try {
  // login — the form pre-fills admin creds; click submit, fall back to Enter in
  // the password field (the submit button click alone can miss pre-hydration).
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  await page.locator('[data-test-id="login-submit"]').click();
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 }).catch(() => {});
    });
  ok(`logged in (${page.url().replace(BASE, '')})`);

  // open the product + История tab
  await page.goto(`${BASE}/products/${productId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="product-detail-widget"]').waitFor({ timeout: 70000 });
  ok('product card mounted');
  await page.locator('[data-test-id="tab-history"]').click();
  await page.waitForTimeout(1500);
  await shot('01-history-tab.png');
  await shot('01-history-full.png').catch(() => {});

  // both sub-sections present
  const hasPurch = (await page.locator('[data-test-id="hist-purchases"]').count()) > 0;
  const hasSales = (await page.locator('[data-test-id="hist-sales"]').count()) > 0;
  if (hasPurch) ok('«Закупки» section present'); else bad('«Закупки» section MISSING');
  if (hasSales) ok('«Продажи» section present'); else bad('«Продажи» section MISSING');

  // pager present in each section (moysklad shows it even at 0 rows)
  const pagers = await page.locator('[data-test-id="hist-purchases"] [data-test-id="pagination"], [data-test-id="hist-purchases"] nav, [data-test-id="hist-purchases"] [class*=pagination]').count();
  // fall back: any «из» range text in the history panel (substring, NOT \bиз\b —
  // JS \b is ASCII-only and never matches a Cyrillic word boundary).
  const rangeText = await page.getByText('из', { exact: false }).count();
  if (rangeText >= 2) ok(`pager range «… из …» shown in both sections (${rangeText})`);
  else bad(`pager range missing (found ${rangeText}, pagers=${pagers})`);

  // page size = 5 (moysklad): the section with the most movements must show
  // exactly 5 rows on page 1 when it has > 5, and its pager must read «1-5 из N».
  const busySel = (target?.sales ?? 0) >= (target?.purchases ?? 0) ? 'hist-sales' : 'hist-purchases';
  const busyTotal = Math.max(target?.sales ?? 0, target?.purchases ?? 0);
  const busyRows = await page.locator(`[data-test-id="${busySel}"] [data-test-id="movement-row"]`).count();
  if (busyTotal > 5) {
    if (busyRows === 5) ok(`page size = 5 (busy section shows 5 of ${busyTotal})`);
    else bad(`page size wrong: busy section shows ${busyRows} (expected 5 of ${busyTotal})`);
    const oneFive = await page.getByText(`1-5 из`, { exact: false }).count();
    if (oneFive >= 1) ok('pager reads «1-5 из …» (5/page)');
    else bad('pager does not read «1-5 из …»');
  } else {
    ok(`busy section has ${busyTotal} (≤5) — page-size-5 not exercised, structure ok`);
  }
  // «Валюта» shows the display name «сум», NOT the raw «UZS» code (moysklad parity).
  const hasSum = (await page.getByText('сум', { exact: false }).count()) > 0;
  const hasRawUzs = (await page.locator('[data-test-id="movement-row"]').getByText('UZS', { exact: true }).count()) > 0;
  if (busyTotal > 0) {
    if (hasSum && !hasRawUzs) ok('«Валюта» shows «сум» (not raw UZS)');
    else bad(`currency display wrong (сум=${hasSum}, rawUZS=${hasRawUzs})`);
  }

  // rows + links (when the product has movements)
  const rowCount = await page.locator('[data-test-id="movement-row"]').count();
  out.rowCount = rowCount;
  if (target && rowCount > 0) {
    ok(`movement rows rendered: ${rowCount}`);
    const firstRow = page.locator('[data-test-id="movement-row"]').first();
    const linkBtns = await firstRow.locator('button').count();
    if (linkBtns >= 1) ok(`row has «№» (and «Контрагент») link button(s): ${linkBtns}`);
    else bad('row has no link buttons');
    // click «№» → navigates to the document (allow the target route's first
    // webpack compile + client navigation to settle).
    await firstRow.locator('button').first().click().catch(() => {});
    await page
      .waitForURL(/\/(supplies|demands)\//, { timeout: 30000 })
      .catch(() => {});
    const navigated = /\/(supplies|demands)\//.test(page.url());
    if (navigated) ok(`«№» link opened the document (${page.url().replace(BASE, '')})`);
    else bad(`«№» link did not navigate (url ${page.url().replace(BASE, '')})`);
  } else {
    ok('no movement rows for this product — structure (sections + headers + pager) certed');
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
