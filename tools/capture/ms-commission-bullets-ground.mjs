import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// READ-ONLY: precisely ground (a) which #commissionreport filter fields carry the
// leading «●» bullet, and (b) whether the reference fields open a multi-select
// checkbox dropdown (vs single). Nothing saved. Creds from .env.local.
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
  const fb = p.locator(':text-is("Фильтр") >> visible=true').first();
  await fb.click().catch(() => {});
  await p.waitForTimeout(2500);

  // (a) For each known label, detect a leading bullet. moysklad renders the dot as
  // a text node «●»/«•» or a small element placed just left of the label at the
  // same vertical line. We check the label's previous sibling / parent text.
  const LABELS = [
    'Период:',
    'Товар или группа',
    'Проект',
    'Контрагент',
    'Группа контрагента',
    'Договор',
    'Владелец контрагента',
    'Организация',
    'Счет организации',
    'Тип документа',
    'Статус',
    'Проведено',
    'Напечатано',
    'Отправлено',
    'Канал продаж',
    'Владелец-сотрудник',
    'Владелец-отдел',
    'Общий доступ',
    'Когда изменен:',
    'Кто изменил',
  ];
  out.bullets = await p.evaluate((labels) => {
    const result = {};
    for (const lbl of labels) {
      const labEl = [...document.querySelectorAll('*')].find(
        (e) => !e.children.length && (e.textContent || '').trim() === lbl,
      );
      if (!labEl) {
        result[lbl] = { found: false };
        continue;
      }
      const r = labEl.getBoundingClientRect();
      // Look for any element to the LEFT of the label (within 40px), same row, that
      // is small (a dot). Also test ::before content.
      const before = window.getComputedStyle(labEl, '::before').content;
      const parent = labEl.parentElement;
      const parentBefore = parent ? window.getComputedStyle(parent, '::before').content : 'none';
      // scan small siblings/cousins near the left edge at the same top
      let dotLeft = false;
      const near = [...document.querySelectorAll('div, span, i, b')].filter((e) => {
        if (e.children.length) return false;
        const rr = e.getBoundingClientRect();
        return (
          Math.abs(rr.top - r.top) < 12 &&
          rr.right <= r.left + 4 &&
          rr.right >= r.left - 40 &&
          rr.width <= 16 &&
          rr.height <= 16
        );
      });
      if (near.length) dotLeft = true;
      result[lbl] = {
        found: true,
        top: Math.round(r.top),
        left: Math.round(r.left),
        cssBefore: before,
        parentCssBefore: parentBefore,
        dotElementLeft: dotLeft,
        nearTexts: near.map((e) => (e.textContent || '').trim()).slice(0, 3),
      };
    }
    return result;
  }, LABELS);

  // (b) click a few reference fields → checkbox multi-select?
  const inspect = () =>
    p.evaluate(() => {
      const pops = [
        ...document.querySelectorAll(
          '.gwt-PopupPanel, [role="listbox"], [class*="dropdown"], [class*="Dropdown"], [class*="popup"], [class*="Popup"]',
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
        checkboxes: last.querySelectorAll('input[type="checkbox"]').length,
        textInputs: last.querySelectorAll('input[type="text"], input:not([type])').length,
        isModalCentered:
          Math.abs(r.left + r.width / 2 - window.innerWidth / 2) < 140 && r.top > 140,
        width: Math.round(r.width),
        sample: (last.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140),
      };
    });
  const clickField = (lbl) =>
    p.evaluate((label) => {
      const lab = [...document.querySelectorAll('*')].find(
        (e) => !e.children.length && (e.textContent || '').trim() === label,
      );
      if (!lab) return false;
      let el = lab.parentElement;
      for (let i = 0; i < 4 && el; i++) {
        const box = el.querySelector(
          'input, [class*="combo"], [class*="Combo"], select, [tabindex]',
        );
        if (box) {
          box.scrollIntoView({ block: 'center' });
          box.click();
          return true;
        }
        el = el.parentElement;
      }
      return false;
    }, lbl);
  out.refType = {};
  for (const lbl of ['Контрагент', 'Проект', 'Организация', 'Канал продаж']) {
    const clicked = await clickField(lbl);
    await p.waitForTimeout(1500);
    out.refType[lbl] = { clicked, ...(await inspect()) };
    await shot(`50-ref-${lbl}.png`);
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(400);
  }
} catch (e) {
  out.error = String(e).slice(0, 500);
}

writeFileSync(resolve(OUT, 'commission-bullets-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
