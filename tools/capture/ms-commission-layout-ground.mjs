import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// READ-ONLY: precisely MEASURE the moysklad «Выданный отчёт комиссионера» editor layout
// so we can match it 1:1 (no guessing). Captures bounding boxes of the meta panel + each
// meta field + the comment box + the totals block + the grid; the «Задачи»/«Файлы» section
// (expanded? button text/colour? files-table columns?); the «❓» help icon near «Проведено»;
// and whether the grid header shows «#». NOTHING saved. Creds from .env.local (never printed).
import { chromium } from 'playwright';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/commission-layout-2026-06-29');
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
  await p.goto(`${base}#commissionreportout/edit?new`, { waitUntil: 'domcontentloaded' });
  await p
    .waitForFunction(() => /Сохранить/.test(document.body.innerText), { timeout: 40000 })
    .catch(() => {});
  await p.waitForTimeout(5000);
  await p.screenshot({ path: resolve(OUT, '00-full.png'), fullPage: true });

  out.measure = await p.evaluate(() => {
    const bbox = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), width: Math.round(r.width) };
    };
    const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    const findByText = (re, tag = '*') =>
      [...document.querySelectorAll(tag)].find((e) => re.test(txt(e)) && !e.querySelector(tag));

    // meta field labels → measure the field's INPUT/combobox right of the label.
    const labelRow = (label) => {
      const lab = [...document.querySelectorAll('*')].find(
        (e) => !e.children.length && txt(e) === label,
      );
      if (!lab) return null;
      const lr = lab.getBoundingClientRect();
      // nearest input/select to the right on the same row.
      const field = [...document.querySelectorAll('input, select, .gwt-SuggestBox, [class*="combobox"]')]
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter((o) => Math.abs(o.r.top - lr.top) < 14 && o.r.left > lr.left && o.r.width > 20)
        .sort((a, c) => a.r.left - c.r.left)[0];
      return { labelLeft: Math.round(lr.left), field: field ? bbox(field.e) : null };
    };

    // totals block: the «Промежуточный итог» label's row container.
    const subtotal = findByText(/^Промежуточный итог:?$/);
    // comment textarea.
    const comment = document.querySelector('textarea');
    // grid table.
    const grid = document.querySelector('table');
    const gridHeaders = grid
      ? [...grid.querySelectorAll('thead th, thead td')].map((e) => txt(e))
      : [];
    // «❓» help icon near «Проведено».
    const prov = [...document.querySelectorAll('*')].find((e) => !e.children.length && /Проведено/.test(txt(e)));
    let helpIcon = null;
    if (prov) {
      const pr = prov.getBoundingClientRect();
      const q = [...document.querySelectorAll('img, [class*="help"], [class*="Help"], [class*="hint"], span')]
        .map((e) => ({ e, r: e.getBoundingClientRect(), t: txt(e) }))
        .find((o) => o.r.top > pr.top - 14 && o.r.top < pr.top + 14 && o.r.right < pr.left && o.r.right > pr.left - 60 && (o.t === '?' || /help|hint|question/i.test(o.e.className || '') || o.e.tagName === 'IMG'));
      helpIcon = q ? { found: true, tag: q.e.tagName, title: q.e.title || q.e.getAttribute('aria-label') || null, leftOfProvedeno: true } : { found: false };
    }
    // «Задачи» / «Файлы» sections.
    const zad = findByText(/^Задачи$/);
    const fil = findByText(/^Файлы$/);
    const hasNetZadach = !!findByText(/Нет задач/);
    const addTask = [...document.querySelectorAll('*')].find((e) => !e.children.length && /^\+?\s*Задача$/.test(txt(e)) === false && /Задача/.test(txt(e)) && txt(e).length < 12);
    const filesTableHeaders = (() => {
      // a table whose header includes «Размер» (the files table).
      const t = [...document.querySelectorAll('table')].find((tb) =>
        /Размер/.test(tb.textContent || ''),
      );
      return t ? [...t.querySelectorAll('thead th, thead td')].map((e) => txt(e)).filter(Boolean) : [];
    })();

    return {
      formRoot: bbox(document.querySelector('[class*="document"], [class*="editor"], form') || document.body),
      org: labelRow('Организация'),
      period: labelRow('Период'),
      contractor: labelRow('Контрагент'),
      contract: labelRow('Договор'),
      currency: labelRow('Валюта документа'),
      commentBox: bbox(comment),
      subtotalRow: bbox(subtotal?.parentElement),
      subtotalLeft: subtotal ? Math.round(subtotal.getBoundingClientRect().left) : null,
      grid: bbox(grid),
      gridHeaders,
      hasHashColumn: gridHeaders.includes('#'),
      helpIcon,
      tasksSection: { found: !!zad, expanded_netZadach: hasNetZadach },
      filesSection: { found: !!fil, filesTableHeaders },
    };
  });
} catch (e) {
  out.error = String(e).slice(0, 500);
}
writeFileSync(resolve(OUT, 'layout-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
