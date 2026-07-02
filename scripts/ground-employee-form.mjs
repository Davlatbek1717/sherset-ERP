// Ground moysklad «Сотрудники» (Настройки→Справочники→Сотрудники): the list AND
// the employee CREATE/EDIT form, focusing on the «Отдел» (department) field — how
// departments are picked/created. READ-ONLY (never saves). Saves text + screenshots.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/employee-form');
fs.mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const URL = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const log = (...a) => console.log(...a);
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
const shot = (n, full = true) => p.screenshot({ path: path.join(OUT, n + '.png'), fullPage: full }).catch(() => {});
try {
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])').first().fill(env.MOYSKLAD_EMAIL).catch(() => {});
  await p.locator('input[type="password"]').first().fill(env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD).catch(() => {});
  await p.locator('input[type="password"]').first().press('Enter').catch(() => {});
  await p.waitForTimeout(10000);
  const base = p.url().split('#')[0];

  // employee list
  await p.goto(base + '#employee', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForSelector('text=Сотрудники', { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(3000);
  await shot('00-employee-list');

  // open create form: click «+ Сотрудник»
  const addBtn = p.locator('text=Сотрудник').filter({ hasText: /^Сотрудник$/ }).first();
  await addBtn.click().catch(() => p.goto(base + '#employee/edit?new', { waitUntil: 'domcontentloaded' }).catch(() => {}));
  await p.waitForTimeout(4000);
  await shot('01-employee-create');
  const formText = await p.locator('body').innerText().catch(() => '');
  fs.writeFileSync(path.join(OUT, '01-create-text.txt'), formText);

  // labels / field names in the form
  const labels = await p.evaluate(() => {
    const s = [];
    for (const el of document.querySelectorAll('label, .gwt-Label, td, span, a, button')) {
      const t = (el.textContent || '').trim();
      if (t && t.length < 45 && el.children.length === 0) s.push(t);
    }
    return [...new Set(s)];
  }).catch(() => []);
  log('FORM LABELS (Отдел-related + all field-ish):');
  for (const t of labels) if (/Отдел|Подразделен|Группа|Имя|Фамилия|E-?mail|Телефон|Логин|Доступ|Должность|Права|Склад/i.test(t)) log('  •', t);

  // try to open the «Отдел» field's dropdown to see create/edit affordances
  const otdel = p.locator('text=Отдел').first();
  if (await otdel.count()) {
    log('\n«Отдел» field present — clicking to inspect its control…');
    await otdel.scrollIntoViewIfNeeded().catch(() => {});
    // click the control next to the label (its row)
    await otdel.click().catch(() => {});
    await p.waitForTimeout(1500);
    await shot('02-otdel-clicked');
    // also try the row's input/select/button
    const dump = await p.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('input, select, button, [role="listbox"], [role="combobox"]')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.top > 0 && r.top < 900) out.push({ tag: el.tagName, type: el.type || '', text: (el.textContent || el.value || '').slice(0, 30), aria: el.getAttribute('aria-label') || '' });
      }
      return out.slice(0, 40);
    }).catch(() => []);
    fs.writeFileSync(path.join(OUT, '02-controls.json'), JSON.stringify(dump, null, 2));
  } else {
    log('\n«Отдел» label NOT found on create form — may be under an access/expand section.');
  }
  log('\nDONE →', OUT);
} catch (e) { log('ERR', e.message); } finally { await b.close(); }
