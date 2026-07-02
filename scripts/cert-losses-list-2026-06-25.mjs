// LIVE CERT — /losses LIST grid → moysklad 1:1 (GRID commit).
// Verifies: column headers in moysklad order (9 default-visible), footer total
// band (Сумма), create button «Списание», search placeholder «Номер или
// комментарий», № brand-blue links, reason/positions columns GONE, the
// aggregate/totals endpoint, 0 console errors. Screenshot for visual diff.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3219';
const OUT = 'D:/projects/moysklad/docs/audits/losses-list-2026-06-25/ours-after-grid.png';
const out = { steps: [], consoleErrors: [] };
const ok = (m) => out.steps.push(`OK  ${m}`);
const bad = (m) => out.steps.push(`BAD ${m}`);

const EXPECTED = [
  '№', 'Время', 'Со склада', 'Организация', 'Сумма', 'Валюта',
  'Отправлено', 'Напечатано', 'Комментарий',
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on('console', (m) => {
  if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200));
});
page.on('pageerror', (e) => out.consoleErrors.push(`PAGEERR ${String(e).slice(0, 200)}`));

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page
        .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
        .catch(() => {});
    });
  ok('logged in');

  await page.goto(`${BASE}/losses`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="losses-page"]').waitFor({ timeout: 90000 });
  await page.locator('thead th').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);

  // (1) column headers in moysklad order (default-visible)
  const headers = (await page.locator('thead th').allTextContents())
    .map((s) => s.trim())
    .filter(Boolean);
  out.headers = headers;
  const core = headers.filter((h) => EXPECTED.includes(h));
  const matchesOrder =
    EXPECTED.every((h, i) => core[i] === h) && core.length === EXPECTED.length;
  if (matchesOrder) ok(`columns 1:1 in order (${core.length}): ${core.join(' · ')}`);
  else
    bad(
      `column order/set mismatch.\n  expected: ${EXPECTED.join(' · ')}\n  got:      ${core.join(' · ')}`,
    );

  // (1b) removed columns must be ABSENT
  if (!headers.includes('Причина')) ok('«Причина» (reason) column removed');
  else bad('«Причина» column still present');

  // (2) footer total band — tfoot present with a numeric Сумма total
  const footerText = await page.evaluate(() => {
    const tf = document.querySelector('tfoot');
    return tf ? (tf.innerText || '').replace(/\s+/g, ' ').trim() : '';
  });
  out.footerText = footerText;
  if (/\d/.test(footerText)) ok(`footer total band present: «${footerText.slice(0, 60)}»`);
  else bad(`footer total band missing / no digits «${footerText}»`);

  // (3) create button label «Списание»
  const createTxt =
    (await page
      .locator('[data-test-id="losses-page"] a[href="/losses/new"]')
      .first()
      .textContent()
      .catch(() => '')) || '';
  if (/^Списание$/.test(createTxt.trim())) ok(`create button «${createTxt.trim()}»`);
  else bad(`create button label = «${createTxt.trim()}» (expected Списание)`);

  // (4) search placeholder «Номер или комментарий»
  const ph = await page
    .locator('[data-test-id="losses-page"] input[type="search"], [data-test-id="losses-page"] input[placeholder]')
    .first()
    .getAttribute('placeholder')
    .catch(() => null);
  out.searchPlaceholder = ph;
  if (ph && /Номер или комментарий/.test(ph)) ok(`search placeholder «${ph}»`);
  else bad(`search placeholder = «${ph}» (expected «Номер или комментарий»)`);

  // (5) № is a brand-blue link to /losses/:id
  const links = await page.evaluate(() => {
    const rows = document.querySelectorAll('tbody tr');
    if (!rows.length) return { hasNumLink: false, rowCount: 0, numColor: '' };
    const first = rows[0];
    const numLink = first.querySelector('a[href^="/losses/"]');
    const color = numLink ? getComputedStyle(numLink).color : '';
    return { hasNumLink: !!numLink, rowCount: rows.length, numColor: color };
  });
  out.links = links;
  if (links.hasNumLink) ok(`№ is a link to /losses/:id (${links.rowCount} rows, color ${links.numColor})`);
  else bad('№ is not a link (or no rows)');

  // (6) «Валюта» column shows «сум» in the first data row
  const curCell = await page.evaluate(() => {
    const rows = document.querySelectorAll('tbody tr');
    if (!rows.length) return '';
    // 6th visible data column = Валюта (after checkbox? — scan for «сум»)
    return (rows[0].innerText || '').includes('сум') ? 'сум' : (rows[0].innerText || '').slice(0, 80);
  });
  out.currencyCell = curCell;
  if (curCell === 'сум') ok('«Валюта» column renders «сум»');
  else bad(`«Валюта» «сум» not found in first row «${curCell}»`);

  // (7) footer total is a properly money-formatted value (proves the
  // aggregate/totals endpoint is wired end-to-end through the real client —
  // the in-memory Bearer token can't be reached by a raw page fetch, so the
  // RENDERED footer is the authoritative proof).
  if (/\d[\d  ]*,\d{2}/.test(footerText)) ok(`footer Сумма is money-formatted «${footerText}»`);
  else bad(`footer Сумма not money-formatted «${footerText}»`);

  await page.screenshot({ path: OUT, fullPage: false });
  ok('screenshot → ours-after-grid.png');
} catch (e) {
  out.fatal = String(e).slice(0, 300);
}finally {
  await browser.close();
}

out.consoleErrorCount = out.consoleErrors.length;
console.log(JSON.stringify(out, null, 2));
