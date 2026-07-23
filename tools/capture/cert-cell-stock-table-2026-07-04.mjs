// CERT — product-card «Место хранения» v3: READ-ONLY per-cell stock table
// (user's example: 01-01-01-01 → 30, 02-03-04-17 → 70). Checks the table rows,
// zone-prefixed cell labels, the total, and that the «Контент…» card stays gone.
// RU locale; cookie-auth; channel:'chrome'. Temp stock seeded by
// apps/api/scratch-cert-cellstock.mjs (run --undo after).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const WEB = 'http://localhost:3299';
const PID = 'f445add8-4d41-4a4a-ac82-1bce3ecc07bd';
const OUT = 'D:/projects/moysklad/docs/audits/product-storage-cells-2026-07-04/cert-v3';
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
  await p.goto(`${WEB}/products/${PID}`, { waitUntil: 'domcontentloaded' });
  if (await p.locator('[data-test-id="login-email"]').count().catch(() => 0)) {
    await p.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await p.fill('[data-test-id="login-password"]', 'admin123');
    await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    await p.waitForURL((u) => u.pathname.includes(`/products/${PID}`), { timeout: 20000 }).catch(() => {});
  }
  await p.locator('[data-test-id="card-storage-cells"]').waitFor({ timeout: 30000 });
  await p.waitForTimeout(1500);
  out.contentCardGone = (await p.locator('[data-test-id="card-content"]').count()) === 0;
  out.rows = await p.locator('[data-test-id="storage-stock-row"]').count();
  out.rowTexts = await p
    .locator('[data-test-id="storage-stock-row"]')
    .allInnerTexts()
    .then((a) => a.map((s) => s.replace(/\s+/g, ' ').trim()));
  out.total = (await p.locator('[data-test-id="storage-stock-total"]').textContent())?.trim();
  await p.locator('[data-test-id="card-storage-cells"]').scrollIntoViewIfNeeded();
  await p.screenshot({ path: resolve(OUT, '10-table.png') });
  // API shape check
  const api = await ctx.request.get(`${WEB}/api/v1/products/${PID}/cell-stock`);
  out.apiStatus = api.status();
  out.apiBody = await api.json();
  out.consoleErrors = errs.slice(0, 8);
} catch (e) {
  out.error = String(e).slice(0, 400);
  await p.screenshot({ path: resolve(OUT, '99-error.png') }).catch(() => {});
}
console.log(JSON.stringify(out, null, 2));
await b.close();
