// READ-ONLY grounding of moysklad «Отгрузки» (#demand) LIST page (NEW design).
// Captures, WITHOUT changing anything (a filter selection persists nothing):
//   1. toolbar buttons (text + order)
//   2. grid column HEADERS in order (default-visible set)
//   3. footer «Итого» row text
//   4. «Фильтр» panel field labels in order
//   5. per reference-looking filter field: inline-dropdown vs modal? checkboxes
//      (multi-select)? search input? + screenshot
//   6. full-page screenshot
// Creds from .env.local (MOYSKLAD_*). Never prints creds.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/demands-list-2026-06-26/moysklad');
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
      isModalCentered:
        Math.abs(r.left + r.width / 2 - window.innerWidth / 2) < 140 && r.top > 120,
      checkboxes: last.querySelectorAll('input[type="checkbox"]').length,
      textInputs: last.querySelectorAll('input[type="text"], input:not([type])').length,
      left: Math.round(r.left),
      top: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
      sampleText: (last.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 180),
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
  await p.locator('input[type="password"]').first().fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = p.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      break;
    }
  }
  await p.waitForTimeout(12000);
  const base = p.url().split('#')[0];
  await p.goto(`${base}#demand`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(11000);
  const cancel = p.locator('button:has-text("Отмена")').first();
  if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) {
    await cancel.click().catch(() => {});
    await p.waitForTimeout(800);
  }
  out.url = p.url();
  await shot('00-list-full.png');

  // 1. toolbar buttons (top action bar). Capture visible buttons near the top.
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
    // try a real table header first
    const ths = [...document.querySelectorAll('th')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim());
    if (ths.filter(Boolean).length >= 3) return ths;
    // fall back to ARIA grid columnheaders
    return [...document.querySelectorAll('[role="columnheader"]')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim());
  });

  // 3. footer «Итого» row
  out.footer = await p.evaluate(() => {
    const cand = [...document.querySelectorAll('tfoot, [class*="footer"], [class*="Footer"], tr')]
      .map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim())
      .filter((t) => /Итого|Сумма|из \d/i.test(t));
    return cand.slice(-6);
  });

  // 4. open «Фильтр» and read field labels in order
  const fb = p.locator(':text-is("Фильтр") >> visible=true').first();
  await fb.click().catch(() => {});
  await p.waitForTimeout(2500);
  await shot('10-filter-open.png');
  out.filterLabels = await p.evaluate(() => {
    // the filter panel labels — collect short label-like texts inside the panel
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
    // de-dup by text keeping first occurrence order (sorted by top then left)
    labs.sort((a, b) => a.top - b.top || a.left - b.left);
    const seen = new Set();
    const ordered = [];
    for (const l of labs) {
      if (!seen.has(l.t)) {
        seen.add(l.t);
        ordered.push(l.t);
      }
    }
    return ordered;
  });

  // 5. per reference-looking field: inline vs modal? checkboxes?
  out.refFields = {};
  for (const [label, key] of [
    ['Контрагент', 'agent'],
    ['Группа контрагента', 'agentGroup'],
    ['Договор', 'contract'],
    ['Организация', 'organization'],
    ['Склад', 'store'],
    ['Проект', 'project'],
    ['Заказ покупателя', 'customerOrder'],
    ['Канал продаж', 'salesChannel'],
    ['Владелец-сотрудник', 'ownerEmployee'],
    ['Владелец-отдел', 'ownerGroup'],
    ['Товар', 'product'],
  ]) {
    const clicked = await clickFieldByLabel(label);
    await p.waitForTimeout(1300);
    out.refFields[key] = { label, clicked, ...(await inspectOpenPopup()) };
    await shot(`20-ref-${key}.png`);
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(400);
  }
} catch (e) {
  out.error = String(e).slice(0, 500);
}

writeFileSync(resolve(OUT, 'demands-list-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ ...out, refFields: Object.keys(out.refFields || {}) }, null, 2));
await b.close();
