// Live moysklad.uz grounding for CRM → «Операции с баллами» (bonus-operations ledger).
// Captures the list page: toolbar, filter, column headers, a few rows. READ-ONLY.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/crm-menu-2026-06-25/bonus-operations');
fs.mkdirSync(OUT, { recursive: true });

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const URL = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('NO creds'); process.exit(2); }
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const loginEl = page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
  await loginEl.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await loginEl.fill(EMAIL).catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASSWORD).catch(() => {});
  const submit = page.locator('button[type="submit"], button:has-text("Войти")').first();
  if (await submit.count()) await submit.click().catch(() => {});
  await page.waitForTimeout(10000);
  const base = page.url().split('#')[0];
  log('logged in:', page.url());

  // open CRM then the «Операции с баллами» tab
  await page.goto(base + '#company', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const tab = page.locator('text="Операции с баллами"').first();
  if (await tab.count()) {
    await tab.click().catch((e) => log('tab click fail', e.message));
    await page.waitForTimeout(5000);
    log('clicked «Операции с баллами»', '→', page.url());
  } else log('tab NOT found');
  await page.screenshot({ path: path.join(OUT, '01-bonus-operations.png') });

  // toolbar buttons + column headers + filter labels
  const data = await page.evaluate(() => {
    const txt = (el) => (el.textContent || '').trim();
    // column headers: th or grid header cells
    const headers = Array.from(document.querySelectorAll('th, [class*="header"] [class*="cell"], .slick-header-column'))
      .map((e) => txt(e)).filter((t) => t && t.length < 40);
    // toolbar buttons (top band)
    const buttons = [];
    for (const b of Array.from(document.querySelectorAll('button, a, .button'))) {
      const r = b.getBoundingClientRect();
      const t = txt(b);
      if (t && t.length < 30 && r.top > 110 && r.top < 165 && r.width > 10) buttons.push(t);
    }
    // first data row cells (sample)
    const firstRow = document.querySelector('tbody tr, .slick-row');
    const rowCells = firstRow ? Array.from(firstRow.children).map((c) => txt(c)).slice(0, 12) : [];
    return { headers: [...new Set(headers)], buttons: [...new Set(buttons)], rowCells };
  });
  fs.writeFileSync(path.join(OUT, '01-structure.json'), JSON.stringify(data, null, 2));
  log('headers:', data.headers.join(' | '));
  log('toolbar:', data.buttons.join(' | '));
  log('row sample:', data.rowCells.join(' | '));

  const bodyText = await page.locator('body').innerText().catch(() => '');
  fs.writeFileSync(path.join(OUT, '01-text.txt'), bodyText);
  log('DONE →', OUT);
} catch (e) {
  log('ERROR:', e.message);
  await page.screenshot({ path: path.join(OUT, 'zz-error.png') }).catch(() => {});
} finally {
  await browser.close();
}
