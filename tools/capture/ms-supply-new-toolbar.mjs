// LIVE moysklad new-supply — extract the EXACT positions-toolbar row + totals
// labels (new react design) to diff against ours. No assumptions.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = 'D:/projects/moysklad/docs/audits/supply-live-audit-2026-07-06/new';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await b.newContext({
  storageState: 'D:/projects/moysklad/.auth/moysklad.json',
  viewport: { width: 1400, height: 1000 },
  locale: 'ru-RU',
});
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
const log = {};
async function gotoRetry(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
      return true;
    } catch {
      await p.waitForTimeout(5000);
    }
  }
  return false;
}
try {
  await gotoRetry('https://online.moysklad.ru/app/#supply');
  await p.waitForTimeout(7000);
  await gotoRetry('https://online.moysklad.ru/app/#supply/edit?new');
  let ready = false;
  for (let i = 0; i < 22; i++) {
    await p.waitForTimeout(2000);
    ready = await p.evaluate(
      () => /Проведено/.test(document.body.textContent || '') && !!document.querySelector('.b-inlineeditor-table'),
    );
    if (ready) break;
  }
  log.ready = ready;
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/60-new-positions-tab.png` });

  // positions toolbar row (above the grid) — capture buttons/labels/toggles
  log.posToolbar = await p.evaluate(() => {
    const grid = document.querySelector('.b-inlineeditor-table');
    if (!grid) return null;
    // walk up to the positions panel, then read the toolbar area text nodes
    const panel = grid.closest('[class*="operation"], [class*="tab"], .react-tabs-panel') || grid.parentElement;
    const txt = (panel?.textContent || '').replace(/\s+/g, ' ');
    return {
      hasVse: /Все\s*\d/.test(txt),
      hasRascenit: txt.includes('Расценить'),
      hasSavePrices: txt.includes('Сохранить цены'),
      hasSkidka: txt.includes('Скидка'),
      hasNdsToggle: txt.includes('НДС'),
      hasPriceIncludesVat: txt.includes('Цена включает НДС'),
      hasCheckBundle: txt.includes('Проверить комплектацию'),
      hasAddFromCatalog: txt.includes('Добавить из справочника'),
    };
  });
  // totals labels (new design)
  log.totals = await p.evaluate(() => {
    const body = (document.body.textContent || '').replace(/\s+/g, ' ');
    return {
      hasPromezh: body.includes('Промежуточный итог'),
      hasSummaNds: body.includes('Сумма НДС'),
      hasObshayaStoimost: body.includes('Общая стоимость'),
      hasItogo: /Итого:/.test(body),
      hasNakladnye: body.includes('Накладные расходы'),
      hasRaspredelit: body.includes('Распределить'),
    };
  });
  // grid header columns
  log.gridHeaders = await p.evaluate(() => {
    const heads = [...document.querySelectorAll('.b-inlineeditor-table .gwt-Label.header, .b-inlineeditor-table th')]
      .map((x) => (x.textContent || '').trim())
      .filter(Boolean);
    return heads.slice(0, 20);
  });
} catch (e) {
  log.error = String(e).slice(0, 400);
  await p.screenshot({ path: `${OUT}/60-error.png` }).catch(() => {});
}
writeFileSync(`${OUT}/TOOLBAR-LOG.json`, JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 2));
await b.close();
