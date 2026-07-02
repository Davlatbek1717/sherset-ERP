// READ-ONLY grounding of the moysklad «Счета покупателям» (invoiceout) LIST page.
// Logs in, navigates to #invoiceout, waits for the grid, screenshots and extracts:
//   - toolbar button labels · grid <th> column headers in order (+ sort) · footer/totals
//   - inline filter-panel field labels (open «Фильтр»)
// NEVER clicks Сохранить/Удалить/Создать or saves/selects. «Сохранение изменений» → «Отмена».
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/invoices-out-list-2026-06-25/moysklad');
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
  const cancel = p.locator('button:has-text("Отмена")').first();
  if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) {
    await cancel.click().catch(() => {});
    await p.waitForTimeout(800);
  }
};
try {
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
  const base = p.url().split('#')[0];
  await p.goto(`${base}#invoiceout`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(10000);
  await dismissSaveModal();
  await p.waitForTimeout(2000);
  out.url = p.url();
  await shot('list-01-default.png');
  out.grid = await p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    // VISIBLE-only: moysklad restores open document tabs (Задачи/Файлы/Итого) that
    // pollute a naive `th` scan. Keep only on-screen, rendered cells.
    const vis = (el) => {
      if (!el || el.offsetParent === null) return false;
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4 && r.top >= 0 && r.top < 1000 && r.left < 1680;
    };
    const btns = [...document.querySelectorAll('button')].filter(vis).map((b) => norm(b.textContent)).filter((t) => t && t.length < 40);
    const headerCells = [...document.querySelectorAll('table thead th, .gwt-grid-header td, [class*="headerCell"], [class*="HeaderCell"], th')].filter(vis);
    const headers = headerCells.map((c) => norm(c.textContent || c.getAttribute('title') || '')).filter((t) => t);
    const footer = [...document.querySelectorAll('tfoot, [class*="footer"], [class*="Footer"], [class*="total"], [class*="Total"]')]
      .filter(vis).map((e) => norm(e.textContent)).filter((t) => t && t.length < 200).slice(0, 8);
    return { btns: [...new Set(btns)].slice(0, 40), headers, footer };
  });
  const filterBtn = p.locator('button:has-text("Фильтр"), :text-is("Фильтр")').first();
  if ((await filterBtn.count()) && (await filterBtn.isVisible().catch(() => false))) {
    await filterBtn.click().catch(() => {});
    await p.waitForTimeout(2500);
    await shot('list-02-filter.png');
    out.filterFields = await p.evaluate(() => {
      const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
      return [...new Set([...document.querySelectorAll('.gwt-Label, label, [class*="filterLabel"], [class*="FieldLabel"]')]
        .map((e) => norm(e.textContent)).filter((t) => t && t.length > 1 && t.length < 40))];
    });
  } else out.filterFields = '(Фильтр button not found)';
} catch (e) {
  out.error = String(e).slice(0, 400);
}
writeFileSync(resolve(OUT, 'list-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2).slice(0, 4000));
await b.close();
