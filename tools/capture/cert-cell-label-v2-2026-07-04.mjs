// CERT — cell label v2 (user decision: LOCATION-ONLY label — cell code + QR,
// NO product info even when the cell HAS stock). Opens the store card, clicks
// the 🖨 on cell 01-01-01-01 (seeded with stock 30), asserts: exactly `copies`
// labels, NO cell-label-name node, code text = the cell code.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const WEB = 'http://localhost:3299';
const STORE = 'd7d27173-b402-469b-9c08-7dd9c130382a'; // Asosiy ombor
const OUT = 'D:/projects/moysklad/docs/audits/product-storage-cells-2026-07-04/cert-cell-label-v2';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1050 }, locale: 'ru-RU' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ru', domain: 'localhost', path: '/' }]);
await ctx.request.post(`${WEB}/api/v1/auth/login`, {
  data: { email: 'admin@demo.local', password: 'admin123' },
  headers: { 'Content-Type': 'application/json' },
});
const p = await ctx.newPage();
p.setDefaultTimeout(30000);
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
const out = {};
try {
  await p.goto(`${WEB}/stores/${STORE}`, { waitUntil: 'domcontentloaded' });
  if (await p.locator('[data-test-id="login-email"]').count().catch(() => 0)) {
    await p.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await p.fill('[data-test-id="login-password"]', 'admin123');
    await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    await p.waitForURL((u) => u.pathname.includes(`/stores/${STORE}`), { timeout: 20000 }).catch(() => {});
  }
  // wait for the address-storage cells table, find the 01-01-01-01 row's print button
  await p.getByText('01-01-01-01', { exact: false }).first().waitFor({ timeout: 30000 });
  const row = p.locator('tr', { hasText: '01-01-01-01' }).first();
  await row.hover();
  await p.waitForTimeout(400);
  await p.screenshot({ path: resolve(OUT, '10-row.png') });
  // the print trigger: a button with a printer icon / label — try test-id first, then title
  const printBtn = row.locator('[data-test-id*="label"], [aria-label*="тикетка"], [title*="тикетка"], button:has(svg)').last();
  await printBtn.click();
  await p.waitForTimeout(1500);
  const overlayUp = (await p.locator('[data-test-id="cell-label-overlay"]').count()) > 0;
  out.overlayUp = overlayUp;
  if (overlayUp) {
    out.labels = await p.locator('[data-test-id="cell-label"]').count();
    out.nameNodes = await p.locator('[data-test-id="cell-label-name"]').count();
    out.codeText = (await p.locator('[data-test-id="cell-label-code"]').first().textContent())?.trim();
    out.qrPresent = (await p.locator('[data-test-id="cell-label"] svg').count()) > 0;
    await p.screenshot({ path: resolve(OUT, '20-label.png') });
  }
  out.consoleErrors = errs.slice(0, 8);
} catch (e) {
  out.error = String(e).slice(0, 400);
  await p.screenshot({ path: resolve(OUT, '99-error.png') }).catch(() => {});
}
console.log(JSON.stringify(out, null, 2));
await b.close();
