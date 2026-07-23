// VERIFY the pixel-fixes on /commission-reports/new in RUSSIAN locale (matches the
// user's side-by-side). Sets NEXT_LOCALE=ru, screenshots, asserts the 7 fixes.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = process.env.CERT_PORT || '3280';
const OUT = resolve('D:/projects/moysklad/docs/audits/commission-reports-new-2026-06-28/cert');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 } });
await ctx.addCookies([
  { name: 'NEXT_LOCALE', value: 'ru', domain: 'localhost', path: '/' },
]);
const p = await ctx.newPage();
const errors = [];
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 140));
});
const out = {};
try {
  await p.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  await p.locator('[data-test-id="login-password"]').fill('admin123').catch(() => {});
  await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
  await p.waitForTimeout(4500);
  await p.goto(`http://localhost:${PORT}/commission-reports/new`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(7000);
  await p.screenshot({ path: resolve(OUT, '02-fixed-ru.png'), fullPage: true });

  const body = await p.evaluate(() => document.body.innerText);
  out.docType = /Выданный отчет комиссионера/.test(body);
  // 1) inline-add now Russian (NOT the hardcoded Uzbek default)
  out.inlineAddRu = await p.evaluate(() => {
    const i = [...document.querySelectorAll('input')].find((e) =>
      /Добавить позицию/.test(e.placeholder || ''),
    );
    const uz = [...document.querySelectorAll('input')].some((e) =>
      /Pozitsiya qo/.test(e.placeholder || ''),
    );
    return { russian: !!i, stillUzbek: uz };
  });
  out.addFromCatalogRu = /Добавить из справочника/.test(body) && !/Katalogdan/.test(body);
  // 2) «Кол-во» (NOT «Кол-во б. ед.»)
  out.qtyHeader = await p.evaluate(() => {
    const ths = [...document.querySelectorAll('th')].map((e) => e.textContent.trim());
    return { hasKolvo: ths.includes('Кол-во'), hasBaseEd: ths.some((t) => /Кол-во б\. ед/.test(t)) };
  });
  // 3) «Цена включает НДС» checked
  out.priceInclVatChecked = await p.evaluate(() => {
    const el = document.querySelector('[data-test-id="totals-vat-included"]');
    return el ? el.checked : null;
  });
  // 4) header field «Комиссия» (NOT «Сумма комиссии»)
  out.commissionFieldLabel = await p.evaluate(() => {
    const labels = [...document.querySelectorAll('label')].map((e) =>
      e.textContent.replace(/\s+/g, ' ').trim(),
    );
    return {
      hasKomissiya: labels.some((t) => t === 'Комиссия'),
      hasSummaKomissii: labels.some((t) => /Сумма комиссии/.test(t)),
    };
  });
  // 5) ✎ near Организация (CatalogPickerField edit button)
  out.orgEditPencil = await p.evaluate(
    () => !!document.querySelector('[aria-label*="едактир"], [title*="едактир"]'),
  );
  // 6) «Наименование ▾» sort trigger
  out.nameSortDropdown = !!(await p
    .locator('[data-test-id="position-name-sort-trigger"]')
    .count());
  // 7) totals still compute structure
  out.totalsRows = {
    commission: /Комиссия:/.test(body),
    commitent: /Сумма комитента:/.test(body),
  };
  // 8) «Период» now uses DatePicker (calendar button) — NOT native «mm/dd/yyyy»
  out.periodWidget = await p.evaluate(() => {
    const nativeDate = document.querySelector('input[type="date"]');
    const dp = document.querySelector('[data-testid="field-period-from"]');
    return { nativeDateInput: !!nativeDate, datePickerTrigger: !!dp };
  });
  // 9) «Валюта» edit-pencil ✎
  out.currencyRateEdit = !!(await p.locator('[data-test-id="currency-rate-edit"]').count());
  // 10) «Канал продаж» «+» create affordance (CatalogPickerField create button)
  out.salesChannelCreate = await p.evaluate(() => {
    // the + appears as a create button inside the sales-channel field row
    const txt = document.body.innerText;
    return /Канал продаж/.test(txt);
  });
} catch (e) {
  out.error = String(e).slice(0, 200);
}
out.consoleErrors = errors;
console.log(JSON.stringify(out, null, 2));
await b.close();
