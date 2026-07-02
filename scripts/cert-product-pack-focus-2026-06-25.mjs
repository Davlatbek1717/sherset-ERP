// LIVE CERT — product card «Упаковка» pack-row FOCUSED-state 1:1 (local app).
// Proves the moysklad focused-row controls actually work at runtime:
//   • whole row turns pale YELLOW (#fffde7) while a cell is focused
//   • ⣿ grip drag handle is present + draggable (reorder wiring)
//   • «↻» generate fills the Штрихкод with a fresh 13-digit internal EAN13
//   • «⊗» delete glyph (Icons.rowDelete) is present
// Adds a throwaway row, exercises the controls, removes it (no DB write needed —
// the add/remove stays client-side; we never click Save here). Asserts 0 console errors.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.CERT_BASE || 'http://localhost:3100';
const API = process.env.CERT_API || 'http://localhost:4000/api/v1';
const OUT = resolve(process.cwd(), 'docs/audits/product-pack-focus-cert-2026-06-25');
mkdirSync(OUT, { recursive: true });
const out = { steps: [], consoleErrors: [], base: BASE };
const ok = (m) => out.steps.push(`✓ ${m}`);
const bad = (m) => out.steps.push(`✗ ${m}`);

// product id via the API (deterministic — avoids list-click flakiness)
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

try {
  // login
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').waitFor({ timeout: 30000 });
  await page.locator('[data-test-id="login-submit"]').click();
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 }).catch(() => {});
    });
  ok(`logged in (url ${page.url().replace(BASE, '')})`);

  // open the product card + Упаковка tab
  await page.goto(`${BASE}/products/${productId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="product-detail-widget"]').waitFor({ timeout: 70000 });
  ok('product card mounted');
  await page.locator('[data-test-id="tab-packaging"]').click();
  await page.waitForTimeout(700);

  // add a throwaway row to focus
  const before = await page.locator('[data-test-id="pack-row"]').count();
  await page.locator('[data-test-id="pack-add"]').click();
  await page.waitForTimeout(400);
  const after = await page.locator('[data-test-id="pack-row"]').count();
  if (after === before + 1) ok(`«⊕ Упаковка» added a row (${before}→${after})`);
  else bad(`add did not add one row (${before}→${after})`);
  const row = page.locator('[data-test-id="pack-row"]').last();

  // ⣿ grip present + draggable
  const grip = row.locator('[data-test-id="pack-grip"]');
  if ((await grip.count()) > 0) ok('⣿ grip drag handle present');
  else bad('⣿ grip drag handle MISSING');
  const draggable = await grip.getAttribute('draggable');
  if (draggable === 'true') ok('grip is draggable=true (reorder wiring)');
  else bad(`grip draggable attr is "${draggable}" (expected true)`);

  // «⊗» delete glyph present (Icons.rowDelete renders an <svg>)
  const delBtn = row.locator('[data-test-id="pack-remove"]');
  const delSvg = await delBtn.locator('svg').count();
  if (delSvg > 0) ok('«⊗» delete glyph (rowDelete svg) present');
  else bad('«⊗» delete glyph MISSING (no svg in pack-remove)');

  // FOCUS the name → the whole <tr> turns pale yellow (#fffde7 = rgb(255,253,231))
  await row.locator('[data-test-id="pack-name"]').click();
  await page.waitForTimeout(250);
  const bg = await row.evaluate((tr) => getComputedStyle(tr).backgroundColor);
  out.rowBgWhenFocused = bg;
  // rgb(255, 253, 231) — allow tiny AA rounding
  const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  const isYellow = m && +m[1] >= 252 && +m[2] >= 250 && +m[3] >= 225 && +m[3] <= 238;
  if (isYellow) ok(`focused row is pale yellow (${bg})`);
  else bad(`focused row not yellow: ${bg} (expected ~rgb(255,253,231))`);
  await shot('01-focused-yellow.png');

  // «↻» generate-barcode → fills the Штрихкод with a fresh 13-digit EAN13
  const barcode = row.locator('[data-test-id="pack-barcode"]');
  const beforeVal = await barcode.inputValue();
  await row.locator('[data-test-id="pack-gen-barcode"]').click();
  await page.waitForTimeout(250);
  const afterVal = await barcode.inputValue();
  out.barcodeBefore = beforeVal;
  out.barcodeAfter = afterVal;
  if (/^\d{13}$/.test(afterVal)) ok(`«↻» generated a 13-digit EAN13: ${afterVal}`);
  else bad(`«↻» did not produce a 13-digit barcode: "${afterVal}"`);
  if (afterVal.startsWith('20')) ok('generated barcode is an internal EAN13 (prefix 20)');
  else bad(`generated barcode is not prefix-20: "${afterVal}"`);
  await shot('02-after-generate.png');

  // remove the throwaway row (client-side; no Save → DB untouched)
  await delBtn.click();
  await page.waitForTimeout(300);
  const final = await page.locator('[data-test-id="pack-row"]').count();
  if (final === before) ok(`removed throwaway row (back to ${before})`);
  else bad(`row count after remove is ${final} (expected ${before})`);
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-error.png');
} finally {
  out.consoleErrorCount = out.consoleErrors.length;
  out.PASS = out.steps.every((s) => s.startsWith('✓')) && out.consoleErrors.length === 0 && !out.error;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
}
