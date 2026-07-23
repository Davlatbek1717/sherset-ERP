// LIVE moysklad — Приёмка EDIT page, every control + what opens on click.
// FRESH goto to the full hash URL (SPA reads hash at boot → routes correctly).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = 'D:/projects/moysklad/docs/audits/supply-live-audit-2026-07-06/edit';
mkdirSync(OUT, { recursive: true });
const EDIT_ID = process.env.EDIT_ID ?? 'c3802589-7880-11f1-0a80-055500229daf';
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
const save = (n, h) => writeFileSync(`${OUT}/${n}.html`, h);

async function clickByText(txt, tag) {
  return await p.evaluate(
    ({ txt, tag }) => {
      const sel = tag || '.b-popup-button, [role="button"], button, .gwt-Label, td, div, span, a';
      const cands = [...document.querySelectorAll(sel)].filter(
        (x) => x.offsetParent !== null && (x.textContent || '').trim() === txt,
      );
      cands.sort((a, z) => a.querySelectorAll('*').length - z.querySelectorAll('*').length);
      const el = cands[0];
      if (!el) return { ok: false };
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      el.click();
      return { ok: true };
    },
    { txt, tag },
  );
}
async function readPopups() {
  return await p.evaluate(() => {
    const pops = [
      ...document.querySelectorAll('.gwt-PopupPanel, .b-popup, [class*="color-list-box"]'),
    ].filter((x) => x.offsetParent !== null && x.getBoundingClientRect().height > 8);
    return pops.map((pop) => {
      const rows = [...pop.querySelectorAll('.gwt-MenuItem, .item, [role="menuitem"], .b-menu-item, td.text, .item-status, a')]
        .map((r) => (r.textContent || '').trim())
        .filter(Boolean);
      const seen = [];
      for (const r of rows) if (!seen.includes(r)) seen.push(r);
      return seen.slice(0, 20);
    });
  });
}
async function dismiss() {
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(250);
  await p.mouse.click(1500, 500).catch(() => {});
  await p.waitForTimeout(400);
}
async function probe(name, txt) {
  const c = await clickByText(txt);
  await p.waitForTimeout(900);
  const menus = c.ok ? await readPopups() : [];
  if (c.ok) await shot(name);
  await dismiss();
  return { trigger: txt, ok: c.ok, menus };
}

try {
  await p.goto(`https://online.moysklad.ru/app/#supply/edit?id=${EDIT_ID}`, {
    waitUntil: 'domcontentloaded',
  });
  // Wait for the editor to actually render — poll for «Проведено» / positions grid.
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(2000);
    ready = await p.evaluate(() =>
      /Проведено/.test(document.body.textContent || '') &&
      !!document.querySelector('.b-inlineeditor-table, [class*="operation-form"]'),
    );
    if (ready) break;
  }
  log.editorReady = ready;
  log.url = p.url();
  await p.waitForTimeout(1500);
  await shot('30-edit-loaded');
  save('30-edit-loaded', await p.content());

  // Header controls present
  log.header = await p.evaluate(() => {
    const statusEl = [...document.querySelectorAll('[data-test-id="statusName"], [class*="selectedName"], .state-panel *')].find(
      (x) => x.childElementCount === 0 && (x.textContent || '').trim(),
    );
    return {
      statusText: statusEl ? statusEl.textContent.trim() : null,
      title: (document.querySelector('.caption, [class*="operationName"]')?.textContent || '').trim().slice(0, 40),
    };
  });

  // STATUS pill — try the actual assigned status name first, then generic «Статус»
  const statusName = log.header.statusText || 'Киритилди';
  log.status = await probe('31-status', statusName);
  if (!log.status.ok) log.status = await probe('31-status', 'Статус');

  log.izmenit = await probe('32-izmenit', 'Изменить');
  log.sozdat = await probe('33-sozdat', 'Создать документ');
  log.pechat = await probe('34-pechat', 'Печать');
  log.otpravit = await probe('35-otpravit', 'Отправить');
  log.name = await probe('36-name', 'Наименование');
  log.markirovka = await probe('37-markirovka', 'Маркировка');
  log.cena = await probe('38-cena', 'Цена');

  // Related-docs tab
  const rel = await clickByText('Связанные документы');
  await p.waitForTimeout(1500);
  await shot('39-tab-related');
  save('39-tab-related', await p.content());
  log.tabRelated = rel.ok;
} catch (e) {
  log.error = String(e).slice(0, 600);
  await shot('ERROR');
}
writeFileSync(`${OUT}/EDIT-LOG.json`, JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 2));
await b.close();
