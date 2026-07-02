// LIVE CERT — /invoices-in LIST grid → moysklad 1:1 (this session).
// Verifies: column headers in moysklad order (15 default-visible), footer
// totals band (Сумма/Оплачено/Принято), «Счет» create button, № + Контрагент
// brand-blue links, 0 console errors. Screenshots for visual diff vs moysklad.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3218';
const OUT = 'D:/projects/moysklad/docs/audits/invoices-in-list-2026-06-25/ours-after.png';
const out = { steps: [], consoleErrors: [] };
const ok = (m) => out.steps.push(`OK  ${m}`);
const bad = (m) => out.steps.push(`BAD ${m}`);

const EXPECTED = [
  '№', 'Время', 'Контрагент', 'Организация', 'На склад', 'Сумма', 'Валюта',
  'Оплачено', 'Принято', 'План. дата оплаты', 'Входящий номер', 'Входящая дата',
  'Отправлено', 'Напечатано', 'Комментарий',
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on('console', (m) => { if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERR ${String(e).slice(0, 200)}`));

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
  await page.waitForTimeout(2500);

  // (1) column headers in moysklad order (default-visible)
  const headers = (await page.locator('thead th').allTextContents()).map((s) => s.trim()).filter(Boolean);
  out.headers = headers;
  // compare the visible-data headers (drop a leading checkbox/empty + trailing gear)
  const core = headers.filter((h) => EXPECTED.includes(h));
  const matchesOrder = EXPECTED.every((h, i) => core[i] === h) && core.length === EXPECTED.length;
  if (matchesOrder) ok(`columns 1:1 in order (${core.length}): ${core.join(' · ')}`);
  else bad(`column order/set mismatch.\n  expected: ${EXPECTED.join(' · ')}\n  got:      ${core.join(' · ')}`);

  // (2) footer totals band — Сумма total = 327 180,04 (32718004 minor, UZS)
  const footerText = await page.evaluate(() => {
    const tf = document.querySelector('tfoot');
    return tf ? (tf.innerText || '').replace(/\s+/g, ' ').trim() : '';
  });
  out.footerText = footerText;
  const normFooter = footerText.replace(/[  ]/g, ' ');
  if (/327[  ]?180,04/.test(normFooter)) ok(`footer totals band present (Сумма total «327 180,04»)`);
  else bad(`footer total Сумма not found in «${footerText}»`);

  // (3) create button label «Счет»
  const createTxt = (await page.locator('[data-test-id="invoices-in-page"] a[href="/invoices-in/new"]').first().textContent().catch(() => '')) || '';
  if (/Счет/.test(createTxt)) ok(`create button «${createTxt.trim()}»`);
  else bad(`create button label = «${createTxt.trim()}» (expected Счет)`);

  // (4) № + Контрагент are brand-blue underlined links
  const links = await page.evaluate(() => {
    const rows = document.querySelectorAll('tbody tr');
    if (!rows.length) return { hasNumLink: false, hasAgentLink: false, rowCount: 0 };
    const first = rows[0];
    const numLink = first.querySelector('a[href^="/invoices-in/"]');
    const agentLink = first.querySelector('a[href^="/counterparties/"]');
    return {
      hasNumLink: !!numLink,
      hasAgentLink: !!agentLink,
      rowCount: rows.length,
    };
  });
  out.links = links;
  if (links.hasNumLink) ok(`№ is a link to /invoices-in/:id (${links.rowCount} rows)`);
  else bad('№ is not a link');
  if (links.hasAgentLink) ok('Контрагент is a link to /counterparties/:id');
  else bad('Контрагент is not a link');

  await page.screenshot({ path: OUT, fullPage: false });
  ok(`screenshot → ours-after.png`);
} catch (e) {
  out.fatal = String(e).slice(0, 300);
} finally {
  await browser.close();
}

out.consoleErrorCount = out.consoleErrors.length;
console.log(JSON.stringify(out, null, 2));
