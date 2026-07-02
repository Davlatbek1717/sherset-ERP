// READ-ONLY grounding of the moysklad «Счета поставщиков» (invoicein) LIST page.
// Logs in, navigates to #invoicein, waits for the grid, screenshots and extracts:
//   - toolbar button labels (left action group)
//   - grid <th> column headers in order (+ which carry a sort arrow)
//   - footer/totals row text (does moysklad show a Сумма total band?)
//   - inline filter-panel field labels (open «Фильтр»)
// NEVER clicks Сохранить/Удалить/Создать or saves/selects anything. If a
// "Сохранение изменений" modal appears, presses «Отмена». Creds from .env.local.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/invoices-in-list-2026-06-25/moysklad');
mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of readFileSync(resolve(REPO, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const SITE = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('NO creds'); process.exit(2); }

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = {};
const shot = (f) => p.screenshot({ path: resolve(OUT, f), fullPage: false }).catch(() => {});

const dismissSaveModal = async () => {
  // If a "Сохранение изменений" dialog is up, click «Отмена» (cancel nav, no write).
  const cancel = p.locator('button:has-text("Отмена")').first();
  if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) {
    await cancel.click().catch(() => {});
    await p.waitForTimeout(800);
  }
};

try {
  // login
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  const pass = p.locator('input[type="password"]').first();
  const login = p.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
  await login.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await login.fill(EMAIL).catch(() => {});
  await pass.fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = p.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) { await el.click().catch(() => {}); break; }
  }
  await p.waitForTimeout(12000);

  // go to the invoicein list (clean)
  const base = p.url().split('#')[0];
  await p.goto(`${base}#invoicein`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(10000);
  await dismissSaveModal();
  await p.waitForTimeout(2000);
  out.url = p.url();
  await shot('list-01-default.png');

  // extract toolbar + grid headers + footer
  out.grid = await p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    // toolbar: the action button row above the grid
    const btns = [...document.querySelectorAll('.toolbar button, [class*="toolbar"] button, button')]
      .map((b) => norm(b.textContent))
      .filter((t) => t && t.length < 40);
    // grid header cells (GWT data grid). Try several header selectors.
    const headerCells = [...document.querySelectorAll(
      'table thead th, .gwt-grid-header td, [class*="headerCell"], [class*="HeaderCell"], th',
    )];
    const headers = headerCells
      .map((c) => ({
        text: norm(c.textContent || c.getAttribute('title') || ''),
        sort: !!c.querySelector('[class*="sort"], [class*="Sort"]') ||
          /sort/i.test(c.className),
        title: c.getAttribute('title') || '',
      }))
      .filter((h) => h.text || h.title);
    // footer / totals band
    const footer = [...document.querySelectorAll('tfoot, [class*="footer"], [class*="Footer"], [class*="total"], [class*="Total"]')]
      .map((e) => norm(e.textContent))
      .filter((t) => t && t.length < 200)
      .slice(0, 8);
    return { btns: btns.slice(0, 40), headers, footer };
  });

  // open «Фильтр» panel and read field labels
  const filterBtn = p.locator('button:has-text("Фильтр"), :text-is("Фильтр")').first();
  if ((await filterBtn.count()) && (await filterBtn.isVisible().catch(() => false))) {
    await filterBtn.click().catch(() => {});
    await p.waitForTimeout(2500);
    await shot('list-02-filter.png');
    out.filterFields = await p.evaluate(() => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      return [...document.querySelectorAll('.gwt-Label, label, [class*="filterLabel"], [class*="FieldLabel"]')]
        .map((e) => norm(e.textContent))
        .filter((t) => t && t.length > 1 && t.length < 40);
    });
  } else out.filterFields = '(Фильтр button not found)';
} catch (e) {
  out.error = String(e).slice(0, 400);
}

writeFileSync(resolve(OUT, 'list-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2).slice(0, 4000));
await b.close();
