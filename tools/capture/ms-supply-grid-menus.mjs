// LIVE moysklad — extract EXACT positions-grid column headers (in order) + the
// remaining toolbar menus (Создать документ, Отправить) from the 00905 editor.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = 'D:/projects/moysklad/docs/audits/supply-live-audit-2026-07-06/edit';
mkdirSync(OUT, { recursive: true });
const EDIT_ID = 'c3802589-7880-11f1-0a80-055500229daf';
const b = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await b.newContext({
  storageState: 'D:/projects/moysklad/.auth/moysklad.json',
  viewport: { width: 1680, height: 1050 },
  locale: 'ru-RU',
});
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
const log = {};
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {});

async function clickContains(txt) {
  return await p.evaluate((txt) => {
    const cands = [...document.querySelectorAll('.b-popup-button, [role="button"], button')].filter(
      (x) => x.offsetParent !== null && (x.textContent || '').trim().startsWith(txt),
    );
    cands.sort((a, z) => (a.textContent || '').length - (z.textContent || '').length);
    const el = cands[0];
    if (!el) return { ok: false };
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.click();
    return { ok: true, text: (el.textContent || '').trim().slice(0, 30) };
  }, txt);
}
async function readPopups() {
  return await p.evaluate(() => {
    const pops = [...document.querySelectorAll('.gwt-PopupPanel, .b-popup')].filter(
      (x) => x.offsetParent !== null && x.getBoundingClientRect().height > 8,
    );
    return pops.map((pop) =>
      [...pop.querySelectorAll('.gwt-MenuItem, .b-menu-item, td.text, .item')]
        .map((r) => (r.textContent || '').trim())
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 20),
    );
  });
}
async function dismiss() {
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(300);
  await p.mouse.click(1550, 600).catch(() => {});
  await p.waitForTimeout(400);
}

try {
  await p.goto(`https://online.moysklad.ru/app/#supply/edit?id=${EDIT_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(2000);
    ready = await p.evaluate(
      () => /Проведено/.test(document.body.textContent || '') && !!document.querySelector('.b-inlineeditor-table'),
    );
    if (ready) break;
  }
  log.ready = ready;

  // EXACT column headers in DOM order (the positions inline-editor header row)
  log.gridHeaders = await p.evaluate(() => {
    const table = document.querySelector('.b-inlineeditor-table');
    if (!table) return null;
    const headerRow = table.querySelector('thead tr, tr.firstRow, tr');
    if (!headerRow) return null;
    return [...headerRow.children].map((td) => ({
      text: (td.textContent || '').trim(),
      cls: td.className,
    }));
  });
  // Also the colgroup classes (authoritative column identity + hidden state)
  log.colgroup = await p.evaluate(() => {
    const table = document.querySelector('.b-inlineeditor-table');
    if (!table) return null;
    const cg = table.querySelector('colgroup');
    if (!cg) return null;
    return [...cg.children].map((c) => c.className);
  });
  log.tableClass = await p.evaluate(() => document.querySelector('.b-inlineeditor-table')?.className ?? null);

  // Создать документ menu
  const c1 = await clickContains('Создать');
  await p.waitForTimeout(900);
  log.sozdat = { click: c1, menus: await readPopups() };
  await shot('40-sozdat');
  await dismiss();

  // Отправить menu
  const c2 = await clickContains('Отправить');
  await p.waitForTimeout(900);
  log.otpravit = { click: c2, menus: await readPopups() };
  await shot('41-otpravit');
  await dismiss();

  // Изменить menu (re-capture reliably)
  const c3 = await clickContains('Изменить');
  await p.waitForTimeout(900);
  log.izmenit = { click: c3, menus: await readPopups() };
  await shot('42-izmenit');
  await dismiss();
} catch (e) {
  log.error = String(e).slice(0, 600);
}
writeFileSync(`${OUT}/GRID-MENUS.json`, JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 2));
await b.close();
