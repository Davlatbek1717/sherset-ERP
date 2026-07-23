// CERT (RU): the position-grid column menus on /commission-reports/new —
//   A) «⚙» gear renders + lists the 5 toggles with moysklad defaults; toggling «Вес»
//      ON makes the «Вес» column appear.
//   B) «Цена ▾» → Расценить / Сохранить цены; «Расценить» opens the price-type modal.
//   C) «Комиссия ▾» → Пересчитать.
//   D) default columns: image col present, «Кол-во» inline unit.
// 0 console errors. Read-only (never saves the doc / never touches products).
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = process.env.CERT_PORT || '3282';
const OUT = resolve('D:/projects/moysklad/docs/audits/commission-grid-menus-2026-06-29/cert');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'ru', domain: 'localhost', path: '/' }]);
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 140));
});
const out = {};
const headers = () =>
  p.evaluate(() =>
    [...document.querySelectorAll('thead th')].map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()),
  );

try {
  await p.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  await p.locator('[data-test-id="login-password"]').fill('admin123').catch(() => {});
  await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
  await p.waitForTimeout(4500);
  await p.goto(`http://localhost:${PORT}/commission-reports/new`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(7000);

  // header triggers present?
  out.triggers = {
    priceMenu: !!(await p.locator('[data-test-id="position-price-menu-trigger"]').count()),
    commissionMenu: !!(await p.locator('[data-test-id="position-commission-menu-trigger"]').count()),
    gear: !!(await p.locator('[data-test-id="position-column-config-trigger"]').count()),
  };

  // D) default columns — image col + inline unit. Image col header is blank, so check
  // the column count + that «Вес»/«Объем»/«Сумма НДС» are NOT present yet (defaults off).
  out.headersDefault = await headers();

  await p.screenshot({ path: resolve(OUT, '00-grid-default.png'), fullPage: false });

  // A) open «⚙» gear → the 5 toggles + defaults.
  await p.locator('[data-test-id="position-column-config-trigger"]').click().catch(() => {});
  await p.waitForTimeout(700);
  await p.screenshot({ path: resolve(OUT, '01-gear-open.png'), fullPage: false });
  out.gearItems = await p.evaluate(() =>
    ['image', 'unit', 'weight', 'volume', 'vatAmount'].map((k) => {
      const el = document.querySelector(`[data-test-id="position-column-toggle-${k}"]`);
      return { key: k, present: !!el, text: el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null };
    }),
  );
  // toggle «Вес» ON.
  await p.locator('[data-test-id="position-column-toggle-weight"]').click().catch(() => {});
  await p.waitForTimeout(600);
  out.headersAfterWeightOn = await headers();
  out.vesAppeared = out.headersAfterWeightOn.includes('Вес') && !out.headersDefault.includes('Вес');
  await p.screenshot({ path: resolve(OUT, '02-weight-on.png'), fullPage: false });

  // B) «Цена ▾» menu.
  await p.locator('[data-test-id="position-price-menu-trigger"]').click().catch(() => {});
  await p.waitForTimeout(600);
  out.priceMenu = {
    reprice: !!(await p.locator('[data-test-id="position-price-reprice"]').count()),
    save: !!(await p.locator('[data-test-id="position-price-save"]').count()),
  };
  await p.screenshot({ path: resolve(OUT, '03-price-menu.png'), fullPage: false });
  // click «Расценить» → modal opens with the two price types.
  await p.locator('[data-test-id="position-price-reprice"]').click().catch(() => {});
  await p.waitForTimeout(700);
  out.repriceModal = {
    saleBtn: !!(await p.locator('[data-test-id="reprice-sale"]').count()),
    buyBtn: !!(await p.locator('[data-test-id="reprice-buy"]').count()),
  };
  await p.screenshot({ path: resolve(OUT, '04-reprice-modal.png'), fullPage: false });
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(400);

  // C) «Комиссия ▾» menu.
  await p.locator('[data-test-id="position-commission-menu-trigger"]').click().catch(() => {});
  await p.waitForTimeout(600);
  out.commissionMenu = {
    recalc: !!(await p.locator('[data-test-id="position-commission-recalc"]').count()),
  };
  await p.screenshot({ path: resolve(OUT, '05-commission-menu.png'), fullPage: false });
} catch (e) {
  out.error = String(e).slice(0, 250);
}
out.consoleErrors = errors;
console.log(JSON.stringify(out, null, 2));
await b.close();
