// READ-ONLY: ground the moysklad invoicein «Создать» dropdown items. Selects
// ALL rows via the header select-all checkbox (NO write), opens «Создать»,
// screenshots + extracts the menu item labels, Escapes. NEVER clicks an item.
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

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = {};
const shot = (f) => p.screenshot({ path: resolve(OUT, f) }).catch(() => {});

try {
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])').first().fill(EMAIL).catch(() => {});
  await p.locator('input[type="password"]').first().fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = p.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) { await el.click().catch(() => {}); break; }
  }
  await p.waitForTimeout(12000);
  const base = p.url().split('#')[0];
  await p.goto(`${base}#invoicein`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(10000);
  const cancel = p.locator('button:has-text("Отмена")').first();
  if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) { await cancel.click().catch(() => {}); await p.waitForTimeout(800); }

  // select-all: the header checkbox is the FIRST checkbox-like control in the grid header
  const selAll = await p.evaluate(() => {
    const inputs = [...document.querySelectorAll('input[type="checkbox"]')].filter((e) => e.offsetParent);
    if (inputs[0]) { inputs[0].click(); return 'input'; }
    // GWT may render a clickable header cell; click the first header checkbox cell
    const cells = [...document.querySelectorAll('th, .gwt-grid-header td')];
    if (cells[0]) { cells[0].click(); return 'cell'; }
    return 'none';
  });
  out.selectAll = selAll;
  await p.waitForTimeout(1800);
  await shot('create-01-selected.png');

  // open «Создать»
  const createBtn = p.locator(':text-is("Создать") >> visible=true').first();
  out.createFound = await createBtn.count();
  await createBtn.click().catch(() => {});
  await p.waitForTimeout(1500);
  await shot('create-02-menu.png');
  out.createMenu = await p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const pops = [...document.querySelectorAll('.gwt-PopupPanel, .gwt-MenuBarPopup, [role="menu"], .popupContent')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 60 && r.height > 20 && r.top > 80; });
    return pops.map((pop) =>
      [...pop.querySelectorAll('.gwt-MenuItem, [role="menuitem"], td, div')]
        .map((e) => norm(e.textContent))
        .filter((t) => t && t.length > 2 && t.length < 45),
    );
  });
} catch (e) {
  out.error = String(e).slice(0, 400);
}

writeFileSync(resolve(OUT, 'create-menu-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2).slice(0, 3000));
await b.close();
