// CERT — product-card «Место хранения» (storage-cell pins, USER-DIRECTED 2026-07-04).
// Flow: open product /[id] → card renders → «⊕ Склад» → StorePickerDialog pick
// «Asosiy ombor» → row appears → CellPickerField → pick «1-ombor / A-01» → Save
// (PATCH 200) → reload → pin hydrated → remove pin → Save → reload → cleared.
// RU locale; cookie-auth; captures console errors. Machine note: channel:'chrome'.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const WEB = 'http://localhost:3299';
const PID = 'f445add8-4d41-4a4a-ac82-1bce3ecc07bd'; // AirPods Pro 2 (dev DB)
const OUT = 'D:/projects/moysklad/docs/audits/product-storage-cells-2026-07-04/cert';
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
let patchStatus = null;
let patch2Status = null;
p.on('response', (r) => {
  if (r.request().method() === 'PATCH' && r.url().includes(`/products/${PID}`)) {
    if (patchStatus === null) patchStatus = r.status();
    else patch2Status = r.status();
  }
});
const out = {};
const shot = (f) => p.screenshot({ path: resolve(OUT, f) }).catch(() => {});
async function login() {
  if (await p.locator('[data-test-id="login-email"]').count().catch(() => 0)) {
    await p.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await p.fill('[data-test-id="login-password"]', 'admin123');
    await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    await p.waitForURL((u) => u.pathname.includes(`/products/${PID}`), { timeout: 20000 }).catch(() => {});
  }
}
try {
  await p.goto(`${WEB}/products/${PID}`, { waitUntil: 'domcontentloaded' });
  await login();
  await p.locator('[data-test-id="card-storage-cells"]').waitFor({ timeout: 30000 });
  out.cardTitle = (await p.locator('[data-test-id="card-storage-cells-toggle"]').innerText()).trim();
  out.hintShown = (await p.locator('[data-test-id="storage-cells-hint"]').count()) > 0;
  await p.locator('[data-test-id="card-storage-cells"]').scrollIntoViewIfNeeded();
  await shot('10-card-empty.png');

  // ⊕ Склад → StorePickerDialog → Asosiy ombor → Выбрать
  await p.locator('[data-test-id="storage-cell-add"]').click();
  await p.waitForTimeout(800);
  await shot('20-store-picker.png');
  await p.getByText('Asosiy ombor', { exact: true }).first().click();
  await p.getByRole('button', { name: 'Выбрать' }).click();
  await p.waitForTimeout(600);
  out.rowAfterStorePick = await p.locator('[data-test-id="storage-cell-row"]').count();

  // CellPickerField → open → pick A-01
  await p.locator('[data-test-id="storage-cell-row"] button').first().click();
  await p.waitForTimeout(900);
  await shot('30-cell-picker.png');
  await p.getByText('A-01', { exact: false }).first().click();
  await p.waitForTimeout(600);
  out.cellLabel = (await p.locator('[data-test-id="storage-cell-row"]').innerText()).replace(/\s+/g, ' ').trim();
  await shot('31-cell-picked.png');

  // Save → PATCH 200
  await p.getByRole('button', { name: 'Сохранить' }).click();
  await p.waitForTimeout(2500);
  out.patchStatus = patchStatus;

  // Reload → hydrated pin
  await p.goto(`${WEB}/products/${PID}`, { waitUntil: 'domcontentloaded' });
  await login();
  await p.locator('[data-test-id="card-storage-cells"]').waitFor({ timeout: 30000 });
  await p.waitForTimeout(1200);
  out.rowsAfterReload = await p.locator('[data-test-id="storage-cell-row"]').count();
  out.hydratedLabel = out.rowsAfterReload
    ? (await p.locator('[data-test-id="storage-cell-row"]').innerText()).replace(/\s+/g, ' ').trim()
    : null;
  await p.locator('[data-test-id="card-storage-cells"]').scrollIntoViewIfNeeded();
  await shot('40-after-reload.png');

  // Remove the pin → Save → reload → cleared
  await p.locator('[data-test-id="storage-cell-row"]').hover();
  await p.locator('[data-test-id="storage-cell-remove"]').click();
  await p.waitForTimeout(400);
  await p.getByRole('button', { name: 'Сохранить' }).click();
  await p.waitForTimeout(2500);
  out.patch2Status = patch2Status;
  await p.goto(`${WEB}/products/${PID}`, { waitUntil: 'domcontentloaded' });
  await login();
  await p.locator('[data-test-id="card-storage-cells"]').waitFor({ timeout: 30000 });
  await p.waitForTimeout(1200);
  out.rowsAfterClear = await p.locator('[data-test-id="storage-cell-row"]').count();
  await shot('50-after-clear.png');

  out.consoleErrors = errs.slice(0, 10);
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-error.png');
}
console.log(JSON.stringify(out, null, 2));
await b.close();
