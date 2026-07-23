// CERT: the /commission-reports/new «Выданный отчёт комиссионера» editor on the
// fresh dev app (:3280 → api :4100). Logs in, opens the editor, verifies the
// header fields / position columns / totals rows render 1:1, adds a position via
// the inline search, checks the «Комиссия» column + computed «Комиссия»/«Сумма
// комитента» totals, then verifies the list create-dropdown «Выданный» navigates
// to /new. Records console errors.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = process.env.CERT_PORT || '3280';
const OUT = resolve('D:/projects/moysklad/docs/audits/commission-reports-new-2026-06-28/cert');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: true });
const p = await (await b.newContext({ viewport: { width: 1680, height: 1000 } })).newPage();
const errors = [];
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 160));
});
const out = {};
const shot = (f) => p.screenshot({ path: resolve(OUT, f), fullPage: true }).catch(() => {});

const labelsAt = () =>
  p.evaluate(() => {
    const txt = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
    const leaves = [...document.querySelectorAll('label, th, dt, h1, h2, span, div')].filter(
      (e) => !e.querySelector('label, th, dt, input, select, textarea, button') || e.tagName === 'TH',
    );
    return [...new Set(leaves.map(txt).filter((t) => t && t.length < 40))];
  });

try {
  await p.goto(`http://localhost:${PORT}/login`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.locator('[data-test-id="login-email"]').fill('admin@demo.local').catch(() => {});
  await p.locator('[data-test-id="login-password"]').fill('admin123').catch(() => {});
  await p.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
  await p.waitForTimeout(4500);

  // ---- A) open the editor directly ----
  await p.goto(`http://localhost:${PORT}/commission-reports/new`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(7000);
  await shot('00-editor.png');

  const all = await labelsAt();
  const want = [
    'Выданный отчёт комиссионера',
    'Организация',
    'Период',
    'Контрагент',
    'Договор',
    'Проект',
    'Комиссия',
    'Канал продаж',
    'Валюта документа',
    'Наименование',
    'Кол-во',
    'Цена',
    'НДС',
    'Сумма',
    'Промежуточный итог:',
    'Итого:',
    'Комиссия:',
    'Сумма комитента:',
  ];
  out.present = {};
  for (const w of want) out.present[w] = all.some((t) => t === w || t.includes(w));
  out.missing = want.filter((w) => !out.present[w]);

  // position grid «Комиссия» column header present?
  out.commissionColHeader = await p.evaluate(() =>
    [...document.querySelectorAll('th')].some((e) => /Комиссия/.test(e.textContent || '')),
  );
  out.docTypeTitle = await p.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((e) =>
      /Выданный отчёт комиссионера/.test((e.textContent || '').trim()),
    );
    return el ? (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) : null;
  });

  // ---- B) add an empty row via «Добавить из справочника / Katalogdan qo'shish»,
  // then fill Цена / Кол-во / Комиссия and watch the totals compute live. (No
  // product picker needed — computeLineTotal works off qty × price.)
  await p
    .locator('button', { hasText: /Katalogdan|справочника/i })
    .first()
    .click()
    .catch(() => {});
  await p.waitForTimeout(1200);
  out.positionRows = await p.evaluate(
    () => document.querySelectorAll('[data-test-id^="position-row-"]').length,
  );
  const setNum = async (sel, val) => {
    const el = p.locator(sel).first();
    if (await el.count()) {
      await el.fill('').catch(() => {});
      await el.type(val, { delay: 30 }).catch(() => {});
      await el.blur().catch(() => {});
      await p.waitForTimeout(400);
    }
  };
  // price 5000 (major), qty 2, commission 1500 → Сумма 10 000, Комиссия 1 500,
  // Сумма комитента 8 500 (VAT default 12% off the «Цена включает НДС» state —
  // we just assert the commission/commitent relationship + non-zero subtotal).
  await setNum('[data-test-id$="-price"]', '5000');
  await setNum('[data-test-id$="-quantity"]', '2');
  await setNum('[data-test-id$="-commission"]', '1500');
  await p.waitForTimeout(600);
  out.totals = await p.evaluate(() => {
    const read = (id) => {
      const el = document.querySelector(`[data-test-id="${id}"]`);
      return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null;
    };
    return {
      subtotal: read('totals-subtotal'),
      total: read('totals-total'),
      commission: read('totals-commission'),
      commitent: read('totals-commitent'),
    };
  });
  await shot('01-with-position.png');

  // ---- C) list create-dropdown «Выданный» → /new ----
  await p.goto(`http://localhost:${PORT}/commission-reports`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.locator('[data-test-id="commission-create"]').click().catch(() => {});
  await p.waitForTimeout(800);
  out.createMenuItems = await p.evaluate(() =>
    [...document.querySelectorAll('[role="menuitem"]')].map((e) => ({
      t: (e.textContent || '').trim(),
      disabled: e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('disabled'),
    })),
  );
  await p.locator('[data-test-id="commission-create-out"]').click().catch(() => {});
  await p.waitForTimeout(2500);
  out.navigatedToNew = p.url().includes('/commission-reports/new');
} catch (e) {
  out.error = String(e).slice(0, 300);
}
out.consoleErrors = errors;
console.log(JSON.stringify(out, null, 2));
await b.close();
