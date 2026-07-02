// FINAL — goods list is a GWT CellTable (.cellTableEvenRow). Click first row's
// name cell → product card. Dump tab strip, click «Упаков…», capture the pack
// table headers + rows + add control + create dialog. READ-ONLY (never saves).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs', 'audits', 'product-pack-live-2026-06-24');
mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of readFileSync(resolve(REPO, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const SITE = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
page.setDefaultNavigationTimeout(120_000);
const out = {};
const shot = (f, opts) => page.screenshot({ path: resolve(OUT, f), ...opts }).catch(() => {});

try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const passEl = page.locator('input[type="password"]').first();
  const loginEl = page
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])')
    .first();
  await loginEl.click().catch(() => {});
  await loginEl.fill(EMAIL).catch(() => {});
  await passEl.fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]', 'input[type="submit"]']) {
    const el = page.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) { await el.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(13000);
  const base = page.url().split('#')[0];
  await page.goto(`${base}#good/list`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cellTableEvenRow', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  out.rowCount = await page.locator('.cellTableEvenRow').count();

  // click the name cell (3rd td: checkbox? Тип, Наименование). GWT CellTable
  // opens the entity on a single row click. Click the «Наименование» cell text.
  const firstRow = page.locator('.cellTableEvenRow').first();
  const cells = firstRow.locator('td');
  out.cellCount = await cells.count();
  out.cellTexts = await cells.evaluateAll((tds) =>
    tds.map((td) => (td.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30)),
  );
  // GWT CellTable has spacer cells; real content is at odd indices
  // (3=Тип, 5=Наименование, 7=Код …). Click the «Наименование» cell (5).
  await cells.nth(5).click().catch(() => {});
  await page.waitForURL(/#good\/edit/, { timeout: 15000 }).catch(() => {});
  if (!/#good\/edit/.test(page.url())) {
    await firstRow.click().catch(() => {}); // fallback: row click
    await page.waitForURL(/#good\/edit/, { timeout: 8000 }).catch(() => {});
  }
  if (!/#good\/edit/.test(page.url())) {
    await cells.nth(5).dblclick().catch(() => {}); // fallback: dblclick
    await page.waitForURL(/#good\/edit/, { timeout: 8000 }).catch(() => {});
  }
  await page.waitForTimeout(9000);
  out.url = page.url();
  out.opened = /#good\/edit/.test(page.url());
  await shot('50-card.png', { fullPage: false });
  await shot('50b-card-full.png', { fullPage: true });

  // dump the tab strip (GWT) — labels + coords
  out.tabs = await page.evaluate(() => {
    const res = [];
    const sels = ['.gwt-TabLayoutPanelTab', '.gwt-TabBarItem', '[role=tab]', '.x-tab', '.tab'];
    for (const sel of sels) {
      for (const e of document.querySelectorAll(sel)) {
        const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length < 40 && e.offsetParent) res.push(`${sel}:: ${t}`);
      }
    }
    return [...new Set(res)];
  });
  // broad fallback: short visible leaves with tab words + coords
  out.tabWords = await page.evaluate(() => {
    const wanted = /Упаков|^Цены$|Остатки|Картинк|Файлы|Связ|Специфик|Единиц|Дополнит|Себестоим|Барко|Серийн|Модификац|Аналог|Где наход/;
    const res = [];
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      if (t && t.length < 40 && wanted.test(t) && e.offsetParent) {
        const r = e.getBoundingClientRect();
        res.push(`${t} @${Math.round(r.x)},${Math.round(r.y)}`);
      }
    }
    return [...new Set(res)];
  });

  // click «Упаков…» — choose lowest/last visible match (tab in card body)
  const packTab = page.locator(':text-matches("Упаков", "i") >> visible=true');
  out.packCount = await packTab.count();
  if (out.packCount) {
    await packTab.last().click().catch(() => {});
    await page.waitForTimeout(4000);
    await shot('51-pack-tab.png', { fullPage: false });
    await shot('51b-pack-tab-full.png', { fullPage: true });

    out.pack = await page.evaluate(() => {
      // headers: GWT CellTable header cells OR slick OR th
      const heads = [];
      document
        .querySelectorAll('.cellTableHeader, th, .slick-column-name, [class*=headerCell]')
        .forEach((h) => {
          const t = (h.getAttribute('title') || h.textContent || '').replace(/\s+/g, ' ').trim();
          if (t && t.length < 40) heads.push(t);
        });
      // buttons in the pack area
      const buttons = [];
      document.querySelectorAll('button, a, [role=button], .gwt-Button, .button').forEach((e) => {
        const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
        if (t && t.length < 40 && e.offsetParent) buttons.push(t);
      });
      return {
        heads: [...new Set(heads)],
        packButtons: [...new Set(buttons)].filter((t) => /упаков|Создать|Добав|Удал|Изменить|\+/i.test(t)),
      };
    });

    // open the create-pack dialog if there's a clear button
    const createBtn = page
      .locator('button:has-text("упаковк"), a:has-text("упаковк"), .gwt-Button:has-text("Создать"), button:has-text("Создать")')
      .last();
    if (await createBtn.count()) {
      await createBtn.click().catch(() => {});
      await page.waitForTimeout(3000);
      await shot('52-pack-dialog.png', { fullPage: false });
      out.dialog = await page.evaluate(() => {
        const root =
          document.querySelector('.gwt-PopupPanel, [class*=opupPanel], [role=dialog]') ||
          document.body;
        const labels = [];
        for (const e of root.querySelectorAll('label, .gwt-Label, td, div, span')) {
          if (e.children.length) continue;
          const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
          if (t && t.length < 40 && e.offsetParent) labels.push(t);
        }
        return {
          labels: [...new Set(labels)].slice(0, 50),
          hasCombo: !!root.querySelector('[class*=combo], [class*=Combo], [class*=Suggest], select'),
          mentionsEd: /Ед\.?\s*измер|Единиц/i.test(root.textContent || ''),
          mentionsTipKoda: /Тип кода/i.test(root.textContent || ''),
          mentionsTasnif: /ТАСНИФ|тасниф/i.test(root.textContent || ''),
        };
      });
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
} catch (e) {
  out.error = String(e).slice(0, 400);
}
writeFileSync(resolve(OUT, 'pack-final.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
