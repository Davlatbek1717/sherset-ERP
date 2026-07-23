import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// READ-ONLY grounding of moysklad «Отчёты комиссионера» (#commissionreport) LIST page.
// Captures, WITHOUT changing anything (filter selection persists nothing):
//   1. toolbar buttons (text + order)
//   2. grid column HEADERS in order (default-visible set)
//   3. grid column-settings ⚙ → full canonical column list + checked state
//   4. footer «Итого» row text
//   5. «Фильтр» panel field labels in order (scoped to the panel)
//   6. filter ⚙ gear → canonical filter-field checklist + checked state
//   7. per reference-looking filter field: inline-dropdown vs modal? checkboxes
//      (multi-select)? search input? + screenshot
//   8. full-page screenshot
// Creds from .env.local (MOYSKLAD_*). Never prints creds.
import { chromium } from 'playwright';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/commission-reports-list-2026-06-27/moysklad');
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
const p = await (
  await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' })
).newPage();
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = {};
const shot = (f) => p.screenshot({ path: resolve(OUT, f), fullPage: false }).catch(() => {});

const inspectOpenPopup = () =>
  p.evaluate(() => {
    const pops = [
      ...document.querySelectorAll(
        '.gwt-PopupPanel, [role="dialog"], [role="listbox"], .popup, [class*="dropdown"], [class*="Dropdown"], [class*="menu"], [class*="Menu"]',
      ),
    ].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 100 && r.height > 30 && r.top > 60;
    });
    const last = pops[pops.length - 1];
    if (!last) return { open: false };
    const r = last.getBoundingClientRect();
    return {
      open: true,
      isModalCentered: Math.abs(r.left + r.width / 2 - window.innerWidth / 2) < 140 && r.top > 120,
      checkboxes: last.querySelectorAll('input[type="checkbox"]').length,
      textInputs: last.querySelectorAll('input[type="text"], input:not([type])').length,
      left: Math.round(r.left),
      top: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
      sampleText: (last.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    };
  });

const clickFieldByLabel = async (label) =>
  p.evaluate((lbl) => {
    const labels = [...document.querySelectorAll('.gwt-Label, label, span, div')].filter(
      (e) => (e.textContent || '').trim() === lbl,
    );
    for (const lab of labels) {
      let el = lab.parentElement;
      for (let i = 0; i < 4 && el; i++) {
        const box = el.querySelector(
          'input, [class*="combo"], [class*="Combo"], [class*="select"], [class*="Select"], .gwt-SuggestBox, [tabindex]',
        );
        if (box) {
          box.scrollIntoView({ block: 'center' });
          box.click();
          return true;
        }
        el = el.parentElement;
      }
    }
    return false;
  }, label);

try {
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])')
    .first()
    .fill(EMAIL)
    .catch(() => {});
  await p
    .locator('input[type="password"]')
    .first()
    .fill(PASSWORD)
    .catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = p.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      break;
    }
  }
  await p.waitForTimeout(12000);
  const base = p.url().split('#')[0];
  await p.goto(`${base}#commissionreport`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(12000);
  const cancel = p.locator('button:has-text("Отмена")').first();
  if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) {
    await cancel.click().catch(() => {});
    await p.waitForTimeout(800);
  }
  out.url = p.url();
  out.pageTitle = await p
    .evaluate(() => {
      const h = [...document.querySelectorAll('h1, h2, [class*="title"], [class*="Title"]')]
        .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim())
        .filter((t) => t.length > 2 && t.length < 60);
      return h.slice(0, 5);
    })
    .catch(() => []);
  await shot('00-list-full.png');

  // 1. toolbar buttons (top action bar)
  out.toolbar = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('button, [role="button"], a')].filter((e) => {
      const r = e.getBoundingClientRect();
      const txt = (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
      return r.top > 60 && r.top < 200 && r.width > 10 && r.height > 10 && txt.length <= 40;
    });
    return [
      ...new Set(
        btns
          .map((e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim())
          .filter(Boolean),
      ),
    ].slice(0, 40);
  });

  // 2. grid column headers (default-visible) in order
  out.columns = await p.evaluate(() => {
    const ths = [...document.querySelectorAll('th')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim());
    if (ths.filter(Boolean).length >= 3) return ths;
    return [...document.querySelectorAll('[role="columnheader"]')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim());
  });

  // 3. grid column-settings ⚙ (top-right of the grid) → full column checklist.
  // moysklad's grid gear is the small icon button at the far right of the header row.
  await p.evaluate(() => {
    const icons = [
      ...document.querySelectorAll('img, button, [class*="settings"], [class*="Settings"]'),
    ].filter((e) => {
      const r = e.getBoundingClientRect();
      const txt = (e.textContent || '').trim();
      return (
        r.top > 60 &&
        r.top < 240 &&
        r.left > window.innerWidth - 220 &&
        r.width > 8 &&
        r.width < 40 &&
        r.height > 8 &&
        r.height < 40 &&
        txt.length === 0
      );
    });
    const gear = icons[icons.length - 1];
    if (gear) gear.click();
  });
  await p.waitForTimeout(1500);
  await shot('05-grid-columns-menu.png');
  out.gridColumnsMenu = await p.evaluate(() => {
    const pops = [
      ...document.querySelectorAll(
        '.gwt-PopupPanel, [role="menu"], [class*="dropdown"], [class*="Dropdown"], [class*="menu"]',
      ),
    ].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 80 && r.height > 60 && r.top > 60;
    });
    const last = pops[pops.length - 1];
    if (!last) return { open: false };
    const items = [...last.querySelectorAll('label, li, [role="menuitemcheckbox"], div')]
      .map((e) => {
        const cb = e.querySelector('input[type="checkbox"]');
        const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
        return cb && t && t.length < 40 ? { t, checked: cb.checked } : null;
      })
      .filter(Boolean);
    const seen = new Set();
    const u = [];
    for (const it of items) {
      if (!seen.has(it.t)) {
        seen.add(it.t);
        u.push(it);
      }
    }
    return { open: true, count: u.length, items: u };
  });
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(500);

  // 4. footer «Итого» row
  out.footer = await p.evaluate(() => {
    const cand = [...document.querySelectorAll('tfoot, [class*="footer"], [class*="Footer"], tr')]
      .map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim())
      .filter((t) => /Итого|Сумма|из \d/i.test(t));
    return cand.slice(-6);
  });

  // 5. open «Фильтр» and read field labels in order (scoped to panel)
  const fb = p.locator(':text-is("Фильтр") >> visible=true').first();
  await fb.click().catch(() => {});
  await p.waitForTimeout(2500);
  await shot('10-filter-open.png');
  out.filterPanel = await p.evaluate(() => {
    const findBtn = [...document.querySelectorAll('button, a, span, div')].find(
      (e) => (e.textContent || '').trim() === 'Найти',
    );
    if (!findBtn) {
      // fall back: collect short labels in the upper area
      const all = [...document.querySelectorAll('.gwt-Label, label, span, div')];
      const labs = [];
      for (const e of all) {
        const r = e.getBoundingClientRect();
        const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
        if (
          r.width > 0 &&
          r.height > 0 &&
          r.top > 100 &&
          t.length > 1 &&
          t.length < 30 &&
          e.children.length === 0
        )
          labs.push({ t, top: Math.round(r.top), left: Math.round(r.left) });
      }
      labs.sort((a, b) => a.top - b.top || a.left - b.left);
      const seen = new Set();
      const ordered = [];
      for (const l of labs)
        if (!seen.has(l.t)) {
          seen.add(l.t);
          ordered.push(l.t);
        }
      return { noFindBtn: true, labels: ordered };
    }
    let panel = findBtn;
    for (let i = 0; i < 8 && panel.parentElement; i++) {
      panel = panel.parentElement;
      if (
        (panel.textContent || '').includes('Очистить') &&
        panel.querySelectorAll('input,select,[class*="combo"],[class*="Combo"]').length > 3
      )
        break;
    }
    const pr = panel.getBoundingClientRect();
    const labs = [];
    for (const e of panel.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
      const r = e.getBoundingClientRect();
      if (t.length > 1 && t.length < 34 && r.width > 0 && r.height > 0 && !/^[\d\s.,:–-]+$/.test(t))
        labs.push({ t, top: Math.round(r.top), left: Math.round(r.left) });
    }
    labs.sort((a, b) => a.top - b.top || a.left - b.left);
    const seen = new Set();
    const ordered = [];
    for (const l of labs)
      if (!seen.has(l.t)) {
        seen.add(l.t);
        ordered.push(l);
      }
    return { panelRect: { w: Math.round(pr.width), h: Math.round(pr.height) }, labels: ordered };
  });

  // 6. filter ⚙ gear → canonical filter-field checklist
  await p.evaluate(() => {
    const findBtn = [...document.querySelectorAll('button, a, span, div')].find(
      (e) => (e.textContent || '').trim() === 'Найти',
    );
    if (!findBtn) return;
    let panel = findBtn;
    for (let i = 0; i < 6 && panel.parentElement; i++) panel = panel.parentElement;
    const icons = [
      ...panel.querySelectorAll(
        'img, [class*="settings"], [class*="Settings"], [class*="gear"], button',
      ),
    ].filter((e) => {
      const r = e.getBoundingClientRect();
      const txt = (e.textContent || '').trim();
      return (
        r.top < findBtn.getBoundingClientRect().bottom + 30 &&
        r.width > 8 &&
        r.width < 40 &&
        r.height > 8 &&
        r.height < 40 &&
        txt.length === 0
      );
    });
    const gear = icons[icons.length - 1];
    if (gear) gear.click();
  });
  await p.waitForTimeout(1500);
  await shot('30-filter-gear.png');
  out.filterGearMenu = await p.evaluate(() => {
    const pops = [
      ...document.querySelectorAll(
        '.gwt-PopupPanel, [role="menu"], [class*="dropdown"], [class*="Dropdown"], [class*="menu"]',
      ),
    ].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 80 && r.height > 60 && r.top > 60;
    });
    const last = pops[pops.length - 1];
    if (!last) return { open: false };
    const items = [...last.querySelectorAll('label, li, [role="menuitemcheckbox"], div')]
      .map((e) => {
        const cb = e.querySelector('input[type="checkbox"]');
        const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
        return cb && t && t.length < 40 ? { t, checked: cb.checked } : null;
      })
      .filter(Boolean);
    const seen = new Set();
    const u = [];
    for (const it of items)
      if (!seen.has(it.t)) {
        seen.add(it.t);
        u.push(it);
      }
    return { open: true, count: u.length, items: u };
  });
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(500);

  // 7. per reference-looking field: inline vs modal? checkboxes?
  out.refFields = {};
  for (const [label, key] of [
    ['Контрагент', 'agent'],
    ['Группа контрагента', 'agentGroup'],
    ['Договор', 'contract'],
    ['Организация', 'organization'],
    ['Проект', 'project'],
    ['Канал продаж', 'salesChannel'],
    ['Владелец-сотрудник', 'ownerEmployee'],
    ['Владелец-отдел', 'ownerGroup'],
    ['Кто изменил', 'modifiedBy'],
    ['Статус', 'status'],
  ]) {
    const clicked = await clickFieldByLabel(label);
    await p.waitForTimeout(1300);
    out.refFields[key] = { label, clicked, ...(await inspectOpenPopup()) };
    await shot(`20-ref-${key}.png`);
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(400);
  }

  // 8. «Показать итоги» totals toggle
  out.showTotals = await p.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find(
      (e) => !e.children.length && /Показать итоги/.test(e.textContent || ''),
    );
    return el ? { present: true, text: el.textContent.trim() } : { present: false };
  });
} catch (e) {
  out.error = String(e).slice(0, 500);
}

writeFileSync(resolve(OUT, 'commission-list-ground.json'), JSON.stringify(out, null, 2));
console.log(
  JSON.stringify(
    {
      url: out.url,
      pageTitle: out.pageTitle,
      toolbar: out.toolbar,
      columns: out.columns,
      footer: out.footer,
      gridColumnsMenu: out.gridColumnsMenu,
      filterPanel: out.filterPanel,
      filterGearMenu: out.filterGearMenu,
      refFields: out.refFields,
      showTotals: out.showTotals,
      error: out.error,
    },
    null,
    2,
  ),
);
await b.close();
