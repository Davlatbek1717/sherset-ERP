// CERT — product-card «Место хранения» v2 (USER-simplified: warehouse ▾ + zone ▾ +
// shelf/row input) + the removed «Контент…» card. Flow: open product → content
// card ABSENT → storage card has 2 selects + input → pick store → pick zone →
// type «02-03-05» → Save (PATCH 200) → reload → all three hydrated → clear store
// → Save → reload → cleared. RU locale; cookie-auth; channel:'chrome'.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const WEB = 'http://localhost:3299';
const PID = 'f445add8-4d41-4a4a-ac82-1bce3ecc07bd'; // AirPods Pro 2 (dev DB)
const OUT = 'D:/projects/moysklad/docs/audits/product-storage-cells-2026-07-04/cert-v2';
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
const patches = [];
p.on('response', (r) => {
  if (r.request().method() === 'PATCH' && r.url().includes(`/products/${PID}`)) patches.push(r.status());
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
async function open() {
  await p.goto(`${WEB}/products/${PID}`, { waitUntil: 'domcontentloaded' });
  await login();
  await p.locator('[data-test-id="card-storage-cells"]').waitFor({ timeout: 30000 });
  await p.waitForTimeout(1200);
}
try {
  await open();
  out.contentCardGone = (await p.locator('[data-test-id="card-content"]').count()) === 0;
  await p.locator('[data-test-id="card-storage-cells"]').scrollIntoViewIfNeeded();
  await shot('10-card.png');

  // pick warehouse → zone list loads → pick zone → type the shelf/row note
  await p.selectOption('[data-test-id="storage-store"]', { label: 'Asosiy ombor' });
  await p.waitForTimeout(1200);
  out.zoneOptions = await p
    .locator('[data-test-id="storage-zone"] option')
    .allTextContents()
    .then((a) => a.map((s) => s.trim()).filter(Boolean));
  await p.selectOption('[data-test-id="storage-zone"]', { label: '1-ombor' });
  await p.fill('[data-test-id="storage-location"]', '02-03-05');
  await shot('20-filled.png');

  await p.getByRole('button', { name: 'Сохранить' }).click();
  await p.waitForTimeout(2500);
  out.patch1 = patches[0] ?? null;

  await open();
  out.hydrated = {
    storeLabel: await p
      .locator('[data-test-id="storage-store"] option:checked')
      .textContent()
      .then((s) => s?.trim()),
    zoneLabel: await p
      .locator('[data-test-id="storage-zone"] option:checked')
      .textContent()
      .then((s) => s?.trim()),
    location: await p.locator('[data-test-id="storage-location"]').inputValue(),
  };
  await p.locator('[data-test-id="card-storage-cells"]').scrollIntoViewIfNeeded();
  await shot('30-after-reload.png');

  // clear the designation (store → «—») → Save → reload → cleared
  await p.selectOption('[data-test-id="storage-store"]', { index: 0 });
  await p.getByRole('button', { name: 'Сохранить' }).click();
  await p.waitForTimeout(2500);
  out.patch2 = patches[1] ?? null;
  await open();
  out.cleared = {
    store: await p.locator('[data-test-id="storage-store"]').inputValue(),
    location: await p.locator('[data-test-id="storage-location"]').inputValue(),
  };
  await shot('40-after-clear.png');
  out.consoleErrors = errs.slice(0, 8);
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-error.png');
}
console.log(JSON.stringify(out, null, 2));
await b.close();
