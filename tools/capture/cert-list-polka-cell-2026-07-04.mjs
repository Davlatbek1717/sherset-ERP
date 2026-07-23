// CERT — «Полка»/«Ячейка» columns on the products LIST (before «Код», ⚙-toggleable)
// + the read-only «Полка»/«Ячейка» rows in the product card's «Общие данные».
// Seed: AirPods in 2 cells (30/70, scratch-cert-cellstock). Checks: column order,
// values, gear hide/show, card fields. Cleanup by the scratch --undo (caller).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const WEB = 'http://localhost:3299';
const PID = 'f445add8-4d41-4a4a-ac82-1bce3ecc07bd'; // AirPods Pro 2
const OUT = 'D:/projects/moysklad/docs/audits/product-storage-cells-2026-07-04/cert-list-cols';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1780, height: 1000 }, locale: 'ru-RU' });
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
async function login(pathCheck) {
  if (await p.locator('[data-test-id="login-email"]').count().catch(() => 0)) {
    await p.fill('[data-test-id="login-email"]', 'admin@demo.local');
    await p.fill('[data-test-id="login-password"]', 'admin123');
    await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    await p.waitForURL((u) => u.pathname.includes(pathCheck), { timeout: 20000 }).catch(() => {});
  }
}
try {
  // ---- LIST ----
  await p.goto(`${WEB}/products`, { waitUntil: 'domcontentloaded' });
  await login('/products');
  await p.getByText('AirPods Pro 2').first().waitFor({ timeout: 30000 });
  await p.waitForTimeout(1000);
  const headers = await p.locator('table th').allInnerTexts();
  const flat = headers.map((h) => h.replace(/\s+/g, ' ').trim());
  out.headers = flat.filter(Boolean).slice(0, 10);
  const iPolka = flat.findIndex((h) => h === 'Полка');
  const iCell = flat.findIndex((h) => h === 'Ячейка');
  const iCode = flat.findIndex((h) => h === 'Код');
  out.orderOk = iPolka > -1 && iCell > iPolka && iCode > iCell;
  const row = p.locator('tr', { hasText: 'AirPods Pro 2' }).first();
  out.rowText = (await row.innerText()).replace(/\s+/g, ' ').trim().slice(0, 160);
  out.rowHasCells = /01-01-01-01, 02-03-04-17/.test(out.rowText);
  out.rowHasPolkas = /1-ombor, 2-ombor/.test(out.rowText);
  await p.screenshot({ path: resolve(OUT, '10-list.png') });

  // gear toggle off → columns disappear
  await p.locator('[data-test-id="column-settings-trigger"], button[aria-label*="олонк"], button[title*="олонк"]').first().click().catch(async () => {
    // fallback: the ⚙ is the last header-end button
    await p.locator('thead button, [data-test-id*="column"]').last().click();
  });
  await p.waitForTimeout(700);
  const polkaToggle = p.getByRole('checkbox', { name: 'Полка' }).first();
  if (await polkaToggle.count()) {
    await polkaToggle.click();
    await p.waitForTimeout(600);
    const headers2 = (await p.locator('table th').allInnerTexts()).map((h) => h.trim());
    out.gearHidesPolka = !headers2.includes('Полка');
    await polkaToggle.click();
    await p.waitForTimeout(600);
    const headers3 = (await p.locator('table th').allInnerTexts()).map((h) => h.trim());
    out.gearShowsPolkaBack = headers3.includes('Полка');
    await p.screenshot({ path: resolve(OUT, '20-gear.png') });
    await p.keyboard.press('Escape');
  } else {
    out.gearHidesPolka = 'checkbox not found';
  }

  // ---- CARD ----
  await p.goto(`${WEB}/products/${PID}`, { waitUntil: 'domcontentloaded' });
  await login(`/products/${PID}`);
  await p.locator('[data-test-id="field-storage-polka"]').waitFor({ timeout: 30000 });
  await p.waitForTimeout(800);
  out.cardPolka = (await p.locator('[data-test-id="field-storage-polka"]').innerText()).trim();
  out.cardCell = (await p.locator('[data-test-id="field-storage-cell"]').innerText()).trim();
  await p.locator('[data-test-id="field-storage-polka"]').scrollIntoViewIfNeeded();
  await p.screenshot({ path: resolve(OUT, '30-card.png') });
  out.consoleErrors = errs.slice(0, 8);
} catch (e) {
  out.error = String(e).slice(0, 400);
  await p.screenshot({ path: resolve(OUT, '99-error.png') }).catch(() => {});
}
console.log(JSON.stringify(out, null, 2));
await b.close();
