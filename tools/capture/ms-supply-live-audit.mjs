// LIVE moysklad audit — Приёмки section, every button + what opens on click.
// Uses saved .auth/moysklad.json. Captures the edit page (from the list's first
// row) and clicks: status pill, Изменить, Создать документ, Печать, Отправить,
// column-header menus (Наименование/Маркировка/Цена), the «+» affordances.
// Writes DOM slices + screenshots to docs/audits/supply-live-audit-2026-07-06/.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = 'D:/projects/moysklad/docs/audits/supply-live-audit-2026-07-06';
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await b.newContext({
  storageState: 'D:/projects/moysklad/.auth/moysklad.json',
  viewport: { width: 1680, height: 1050 },
  locale: 'ru-RU',
});
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
const log = {};
const save = (name, html) => writeFileSync(`${OUT}/${name}.html`, html);
const shot = (name) => p.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});

async function openMenusUnder(triggerText) {
  // find a b-popup-button / gwt button by its visible text, click, snapshot
  const clicked = await p.evaluate((txt) => {
    const btn = [...document.querySelectorAll('.b-popup-button, [role="button"], button')].find(
      (x) => (x.textContent || '').trim().startsWith(txt) && x.offsetParent !== null,
    );
    if (!btn) return false;
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    btn.click();
    return true;
  }, triggerText);
  if (!clicked) return { trigger: triggerText, found: false };
  await p.waitForTimeout(900);
  const items = await p.evaluate(() => {
    // moysklad popups: b-popup / gwt-PopupPanel / b-menu with .gwt-MenuItem or .item rows
    const pops = [...document.querySelectorAll('.gwt-PopupPanel, .b-popup, [class*="popup"], [class*="menu-popup"]')].filter(
      (x) => x.offsetParent !== null,
    );
    const out = [];
    for (const pop of pops) {
      const rows = [...pop.querySelectorAll('.gwt-MenuItem, .item, [role="menuitem"], td.text, .b-menu-item')]
        .map((r) => (r.textContent || '').trim())
        .filter(Boolean);
      if (rows.length) out.push(rows);
    }
    return out;
  });
  return { trigger: triggerText, found: true, menus: items };
}

try {
  await p.goto('https://online.moysklad.ru/app/#supply', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(9000);
  log.listUrl = p.url();
  log.loggedIn = !/login|auth/i.test(p.url());
  await shot('00-list');
  save('00-list', await p.content());

  // Open the first supply row → edit page
  const opened = await p.evaluate(() => {
    const link = document.querySelector('a[href*="supply/edit"]');
    if (link) {
      link.click();
      return link.getAttribute('href');
    }
    // fallback: double-click first data row
    const row = document.querySelector('.b-grid-row, tr[class*="row"]');
    if (row) {
      row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return 'dblclick-row';
    }
    return null;
  });
  log.openedEdit = opened;
  await p.waitForTimeout(9000);
  log.editUrl = p.url();
  await shot('10-edit-default');
  save('10-edit-default', await p.content());

  // Enumerate all visible buttons/labels in the toolbar + header for grounding
  log.toolbarButtons = await p.evaluate(() =>
    [...document.querySelectorAll('.b-popup-button, .editor-toolbar [role="button"], .editor-toolbar button')]
      .filter((x) => x.offsetParent !== null)
      .map((x) => (x.textContent || '').trim())
      .filter(Boolean)
      .slice(0, 25),
  );

  // Status pill dropdown
  log.status = await p.evaluate(() => {
    const pill = document.querySelector('[data-test-id="doc-status"], .state-panel [class*="selected"], [class*="status"]');
    if (!pill) return { found: false };
    pill.click();
    return { found: true, text: (pill.textContent || '').trim() };
  });
  await p.waitForTimeout(900);
  log.statusPopup = await p.evaluate(() => {
    const pops = [...document.querySelectorAll('.gwt-PopupPanel, [class*="color-list-box"], [class*="status"]')].filter(
      (x) => x.offsetParent !== null,
    );
    return pops.map((pop) => [...pop.querySelectorAll('*')].filter((n) => n.childElementCount === 0 && n.textContent.trim()).map((n) => n.textContent.trim()).slice(0, 12));
  });
  await shot('11-status-popup');
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(500);

  // Toolbar dropdowns
  log.izmenit = await openMenusUnder('Изменить');
  await shot('12-izmenit');
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(400);
  log.sozdat = await openMenusUnder('Создать документ');
  await shot('13-sozdat');
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(400);
  log.pechat = await openMenusUnder('Печать');
  await shot('14-pechat');
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(400);
  log.otpravit = await openMenusUnder('Отправить');
  await shot('15-otpravit');
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(400);

  // Column-header menus in the positions grid
  log.naименование = await openMenusUnder('Наименование');
  await shot('16-name-menu');
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(400);
  log.markirovka = await openMenusUnder('Маркировка');
  await shot('17-markirovka-menu');
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(400);
  log.cena = await openMenusUnder('Цена');
  await shot('18-cena-menu');
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(400);

  // Column gear (⚙) on «Сумма ГТД»/last header
  log.gear = await p.evaluate(() => {
    const gear = document.querySelector('.b-inlineeditor-table .b-clickable-image, [class*="settings"], th [class*="gear"]');
    if (!gear) return { found: false };
    gear.click();
    return { found: true };
  });
  await p.waitForTimeout(900);
  await shot('19-gear');
} catch (e) {
  log.error = String(e).slice(0, 500);
  await shot('ERROR');
}
writeFileSync(`${OUT}/AUDIT-LOG.json`, JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 2));
await b.close();
