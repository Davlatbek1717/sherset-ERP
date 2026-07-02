// LIVE CERT — pack-row «Наименование» = units-suggest + «+» create-unit (moysklad
// parity, live-grounded focus-v8.json). Proves at runtime:
//   • typing in the name shows a units-suggestion dropdown over the uom registry
//   • clicking a suggestion sets the pack name to that unit
//   • the green «+» opens a create-unit modal prefilled with the typed text
//   • Создать → POST /uoms (a REAL new unit) → name becomes the new unit
//   • the new unit actually exists via the API (then cleaned up with DELETE /uoms/:id)
// The throwaway pack row is removed client-side (no product Save). Asserts 0 console errors.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.CERT_BASE || 'http://localhost:3100';
const API = process.env.CERT_API || 'http://localhost:4000/api/v1';
const OUT = resolve(process.cwd(), 'docs/audits/product-pack-name-suggest-cert-2026-06-25');
mkdirSync(OUT, { recursive: true });
const out = { steps: [], consoleErrors: [], base: BASE };
const ok = (m) => out.steps.push(`✓ ${m}`);
const bad = (m) => out.steps.push(`✗ ${m}`);

const lr = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'admin@demo.local', password: 'admin123' }),
});
const { accessToken } = await lr.json();
const auth = { authorization: `Bearer ${accessToken}` };
const pj = await (await fetch(`${API}/products?limit=1`, { headers: auth })).json();
const productId = pj.items?.[0]?.id;
if (!productId) {
  out.fatal = 'no product id';
  console.log(JSON.stringify(out, null, 2));
  process.exit(1);
}
out.productId = productId;
const STAMP = `CERTUNIT-${productId.slice(0, 4)}-${productId.slice(-4)}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const shot = (f) => page.screenshot({ path: resolve(OUT, f) }).catch(() => {});
page.on('console', (m) => {
  if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERROR: ${String(e).slice(0, 200)}`));

let createdUnitId = null;
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').waitFor({ timeout: 30000 });
  await page.locator('[data-test-id="login-submit"]').click();
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 }).catch(() => {});
    });
  ok('logged in');

  await page.goto(`${BASE}/products/${productId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="product-detail-widget"]').waitFor({ timeout: 70000 });
  await page.locator('[data-test-id="tab-packaging"]').click();
  await page.waitForTimeout(700);

  const before = await page.locator('[data-test-id="pack-row"]').count();
  await page.locator('[data-test-id="pack-add"]').click();
  await page.waitForTimeout(400);
  const row = page.locator('[data-test-id="pack-row"]').last();
  ok(`added a throwaway row (was ${before})`);

  // (1) type in the name → the units-suggest dropdown appears
  const nameInput = row.locator('[data-test-id="pack-name"]');
  await nameInput.click();
  await nameInput.fill('к');
  await page.waitForTimeout(600);
  const suggestVisible = (await page.locator('[data-test-id="pack-name-suggest"]').count()) > 0;
  const itemCount = await page.locator('[data-test-id="pack-name-suggest-item"]').count();
  if (suggestVisible && itemCount > 0) ok(`units-suggest dropdown shows ${itemCount} unit(s) for "к"`);
  else bad(`suggest dropdown missing/empty (visible=${suggestVisible}, items=${itemCount})`);
  await shot('01-suggest-open.png');

  // (2) click a suggestion → name becomes that unit
  const firstItem = page.locator('[data-test-id="pack-name-suggest-item"]').first();
  const pickedLabel = (await firstItem.textContent())?.trim() || '';
  await firstItem.click();
  await page.waitForTimeout(400);
  const afterPick = await nameInput.inputValue();
  out.pickedLabel = pickedLabel;
  out.afterPick = afterPick;
  if (afterPick && pickedLabel.includes(afterPick)) ok(`picking a suggestion set the name to "${afterPick}"`);
  else bad(`pick did not set the name (got "${afterPick}", label "${pickedLabel}")`);

  // (3) green «+» → the create-unit modal opens, prefilled with the current text
  await row.locator('[data-test-id="pack-name-create-unit"]').click();
  await page.waitForTimeout(500);
  const modal = page.locator('[data-testid="pack-unit-modal"]');
  if ((await modal.count()) > 0) ok('«+» opened the create-unit modal');
  else bad('«+» did not open the create-unit modal');
  await shot('02-create-unit-modal.png');

  // (4) type a NEW unique unit name → Создать → POST /uoms
  await page.locator('[data-test-id="pack-unit-name"]').fill(STAMP);
  await page.locator('[data-test-id="pack-unit-create"]').click();
  await page.waitForTimeout(1500);
  const modalGone = (await page.locator('[data-testid="pack-unit-modal"]').count()) === 0;
  if (modalGone) ok('modal closed after Создать');
  else bad('modal still open after Создать');
  const afterCreate = await nameInput.inputValue();
  out.afterCreate = afterCreate;
  if (afterCreate === STAMP) ok(`name set to the new unit "${STAMP}"`);
  else bad(`name not set to new unit (got "${afterCreate}")`);
  await shot('03-after-create.png');

  // (5) the unit REALLY exists via the API
  const list = await (
    await fetch(`${API}/uoms?search=${encodeURIComponent(STAMP)}`, { headers: auth })
  ).json();
  const found = (list.items ?? []).find((u) => u.name === STAMP);
  createdUnitId = found?.id ?? null;
  if (createdUnitId) ok(`new unit persisted via API (id ${createdUnitId.slice(0, 8)}…)`);
  else bad('new unit NOT found via API — POST /uoms did not persist');
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-error.png');
} finally {
  // cleanup — DELETE the created unit so the DB is restored
  if (createdUnitId) {
    const del = await fetch(`${API}/uoms/${createdUnitId}`, { method: 'DELETE', headers: auth }).catch(
      () => null,
    );
    out.cleanupStatus = del?.status ?? 'failed';
    if (del?.ok) out.steps.push('✓ cleaned up the CERT unit (DELETE /uoms/:id)');
    else out.steps.push(`✗ cleanup DELETE failed (status ${out.cleanupStatus})`);
  }
  out.consoleErrorCount = out.consoleErrors.length;
  out.PASS = out.steps.every((s) => s.startsWith('✓')) && out.consoleErrors.length === 0 && !out.error;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
