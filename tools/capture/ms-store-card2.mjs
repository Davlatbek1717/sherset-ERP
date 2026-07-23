// READ-ONLY v2: open «Иподром Склад» card via the right-list double-click (from
// the «Склады» tree root) AND via the edit pencil. Capture «Адресное хранение»
// + «Ячейки». NEVER saves / toggles. Creds from .env.local.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/cell-storage-2026-06-26/moysklad');
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
p.setDefaultTimeout(30000);
p.setDefaultNavigationTimeout(120000);
const out = { steps: [] };
const log = (...a) => { out.steps.push(a.join(' ')); console.log(...a); };
const shot = (f) => p.screenshot({ path: resolve(OUT, f), fullPage: true }).catch(() => {});

const allVisible = () => p.evaluate(() => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const hits = [];
  for (const el of document.querySelectorAll('div, td, th, label, span, a, button, input, select')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (el.tagName === 'INPUT') {
      const type = el.getAttribute('type') || 'text';
      hits.push(`INPUT.${type}[${norm(el.getAttribute('placeholder'))}]=${norm(el.value).slice(0, 24)}${el.checked ? ' ✓CHECKED' : ''}`);
      continue;
    }
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
    const t = norm(own);
    if (t && t.length < 70) hits.push(t);
  }
  return [...new Set(hits)];
});

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
  await p.goto(`${base}#warehouse`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(10000);

  // Ensure right list shows the warehouses (click tree root «Склады»)
  const rootNode = p.locator('text="Склады"').nth(1); // [0]=page title, [1]=tree root
  if ((await rootNode.count()) && (await rootNode.isVisible().catch(() => false))) {
    await rootNode.click().catch(() => {});
    await p.waitForTimeout(2500);
  }

  // Double-click «Иподром Склад» in the RIGHT data list (not the tree).
  // The right list rows live in a table; pick the row link whose text matches.
  const rightRow = p.locator('table a:has-text("Иподром Склад"), table td:has-text("Иподром Склад")').last();
  if (await rightRow.count()) {
    await rightRow.dblclick().catch(() => {});
    await p.waitForTimeout(9000);
  }
  await shot('60-card.png');
  out.url1 = p.url();

  let labels = await allVisible();
  out.cellRelevant1 = labels.filter((t) => /ячей|адрес|хранени|зон|использов|включ|✓CHECKED/i.test(t));
  log('attempt1 cell/addr:', JSON.stringify(out.cellRelevant1));

  // If no «хранение» text yet, try the edit pencil at the tree row (precise coords)
  if (!labels.some((t) => /хранени|ячей/i.test(t))) {
    const treeRow = p.locator('text="Иподром Склад"').first();
    await treeRow.click().catch(() => {});
    await p.waitForTimeout(1200);
    const box = await treeRow.boundingBox();
    if (box) {
      // pencil sits ~40px left of the text baseline
      for (const dx of [-40, -32, -48]) {
        await p.mouse.click(box.x + dx, box.y + box.height / 2).catch(() => {});
        await p.waitForTimeout(6000);
        if (/edit|view/i.test(p.url()) || (await allVisible()).some((t) => /хранени|ячей/i.test(t))) break;
      }
    }
    await shot('61-card-pencil.png');
    out.url2 = p.url();
    labels = await allVisible();
    out.cellRelevant2 = labels.filter((t) => /ячей|адрес|хранени|зон|использов|включ|✓CHECKED/i.test(t));
    log('attempt2 cell/addr:', JSON.stringify(out.cellRelevant2));
  }

  out.allCardLabels = labels;
  // If «Адресное хранение» exists, capture the «Ячейки» area
  for (const t of ['Ячейки', 'Зоны и ячейки']) {
    const el = p.locator(`text="${t}"`).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      await p.waitForTimeout(4000);
      await shot('62-cells.png');
      out.cellsArea = (await allVisible()).filter((x) => /ячей|код|наимен|зон|удал|добав|импорт|редакт|пуст|строк/i.test(x));
      log('cells area:', JSON.stringify(out.cellsArea));
      break;
    }
  }

  writeFileSync(resolve(OUT, 'store-card2.json'), JSON.stringify(out, null, 2));
  log('DONE url=', p.url());
} catch (e) {
  log('ERR', e.message);
  writeFileSync(resolve(OUT, 'store-card2.json'), JSON.stringify(out, null, 2));
} finally {
  await b.close();
}
