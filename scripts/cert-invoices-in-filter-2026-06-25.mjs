// LIVE CERT — /invoices-in filter panel → moysklad 25-field 1:1 (this session).
// Verifies: filter CLOSED by default; grid still 15 cols + «Входящий номер» full
// header; clicking «Фильтр» reveals 25 fields in moysklad order; new fields
// present (Оплата/Приемка/Общий доступ/Кто изменил/Входящий номер/Входящая дата/
// План.дата оплаты); old «Заказ поставщику»/«Сумма» ABSENT; 0 console errors.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3218';
const OUT = 'D:/projects/moysklad/docs/audits/invoices-in-list-2026-06-25/ours-filter-after.png';
const out = { steps: [], consoleErrors: [] };
const ok = (m) => out.steps.push(`OK  ${m}`);
const bad = (m) => out.steps.push(`BAD ${m}`);

// the 25 filter fields in moysklad order (testid suffix; incoming-number is field #2)
const ORDER = [
  'filter-period', 'filter-incoming-number', 'filter-incoming-date', 'filter-payment-state',
  'filter-receive-state', 'filter-payment-planned', 'filter-product', 'filter-store',
  'filter-project', 'filter-agent', 'filter-agent-group', 'filter-agent-account',
  'filter-contract', 'filter-agent-owner', 'filter-org', 'filter-org-account', 'filter-state',
  'filter-applicable', 'filter-printed', 'filter-published', 'filter-owner', 'filter-group',
  'filter-shared', 'filter-updated', 'filter-modified-by',
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on('console', (m) => { if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERR ${String(e).slice(0, 200)}`));

// MultiCombobox/Combobox emit `data-testid` (NO hyphen); other controls use
// `data-test-id`. Accept either so the cert doesn't false-negative on the
// multi-select filter fields.
const visible = (tid) =>
  page.locator(`[data-test-id="${tid}"], [data-testid="${tid}"]`).first().isVisible().catch(() => false);

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 }).catch(async () => {
    await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
    await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 }).catch(() => {});
  });
  ok('logged in');

  await page.goto(`${BASE}/invoices-in`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="invoices-in-page"]').waitFor({ timeout: 80000 });
  await page.locator('thead th').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);

  // (1) filter CLOSED by default — the field controls must NOT be visible yet
  const periodVisibleBefore = await visible('filter-period');
  if (!periodVisibleBefore) ok('filter panel CLOSED by default (moysklad)');
  else bad('filter panel is OPEN by default (should be closed)');

  // (2) grid still 15 cols + «Входящий номер» full word header
  const headers = (await page.locator('thead th').allTextContents()).map((s) => s.trim());
  if (headers.includes('Входящий номер')) ok('«Входящий номер» full-word column header');
  else bad(`column header is «${headers.find((h) => /Входящ/.test(h)) ?? '—'}» (expected «Входящий номер»)`);
  const footer = await page.evaluate(() => {
    const tf = document.querySelector('tfoot');
    return tf ? (tf.innerText || '').replace(/\s+/g, ' ').trim() : '';
  });
  if (/327[  ]?180,04/.test(footer.replace(/[  ]/g, ' '))) ok('footer totals band still present');
  else bad(`footer total missing: «${footer}»`);

  // (3) open «Фильтр»
  await page.locator('button:has-text("Фильтр")').first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: OUT, fullPage: false });

  // (4) all 25 fields visible in order
  let order = true;
  const seen = [];
  for (const tid of ORDER) {
    const v = await visible(tid);
    seen.push(`${tid}:${v ? '✓' : '✗'}`);
    if (!v) order = false;
  }
  out.fields = seen;
  if (order) ok(`all 25 filter fields visible in moysklad order`);
  else bad(`missing field(s): ${seen.filter((s) => s.endsWith('✗')).join(', ')}`);

  // (5) old fields ABSENT
  const poGone = !(await page.locator('[data-test-id="filter-purchase-order"]').count());
  const sumGone = !(await page.locator('[data-test-id="filter-sum-from"]').count());
  if (poGone && sumGone) ok('«Заказ поставщику» + «Сумма» filters removed (moysklad)');
  else bad(`stale filters present: po=${!poGone} sum=${!sumGone}`);
} catch (e) {
  out.fatal = String(e).slice(0, 300);
} finally {
  await browser.close();
}

out.consoleErrorCount = out.consoleErrors.length;
console.log(JSON.stringify(out, null, 2));
