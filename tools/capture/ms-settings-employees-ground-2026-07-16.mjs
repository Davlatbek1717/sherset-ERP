// READ-ONLY ground: moysklad Настройки left-nav (FULL list incl. below Ставки НДС)
// + Справочники → Сотрудники list + employee card + «Настроить права» matrix +
// «История изменений» right panel. Uses saved session .auth/moysklad.json.
// NEVER clicks Сохранить / Сбросить пароль / Поместить в архив / Удалить.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const OUT = resolve('D:/projects/moysklad/docs/audits/settings-employees-2026-07-16');
mkdirSync(OUT, { recursive: true });

const EMPLOYEE_EDIT_ID = '8f7cb209-fd7b-11ef-0a80-05f40025cbe1'; // Бекзод (from user's screenshot)

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({
  storageState: 'D:/projects/moysklad/.auth/moysklad.json',
  viewport: { width: 1680, height: 1000 },
  locale: 'ru-RU',
});
const p = await ctx.newPage();
p.setDefaultTimeout(30000);
const out = { steps: [] };
const log = (...a) => {
  out.steps.push(a.join(' '));
  console.info(...a);
};

// Dump every element that owns visible text, with geometry + key computed styles.
const dumpText = (opts = {}) => p.evaluate(({ maxX, maxLen }) => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const res = [];
  for (const el of document.querySelectorAll('a, span, div, td, th, label, button, h1, h2, h3, p, input')) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (maxX && r.x > maxX) continue;
    let t;
    if (el.tagName === 'INPUT') {
      t = norm(el.value || el.placeholder);
      if (t) t = `[input ${el.type}] ${t}`;
    } else {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
      t = norm(own);
    }
    if (!t || t.length > (maxLen || 80)) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    res.push({
      t,
      tag: el.tagName.toLowerCase(),
      box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      color: cs.color,
      bg: cs.backgroundColor,
      fs: cs.fontSize,
      fw: cs.fontWeight,
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 50),
      title: el.getAttribute('title') || undefined,
    });
  }
  return res;
}, { maxX: opts.maxX, maxLen: opts.maxLen });

const gotoHash = async (hash) => {
  await p.goto(`https://online.moysklad.ru/app/#${hash}`, { waitUntil: 'domcontentloaded' });
  await p.reload({ waitUntil: 'domcontentloaded' }); // GWT: reload-per-hash
  await p.waitForTimeout(9000);
};

try {
  await p.goto('https://online.moysklad.ru/app/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(9000);
  out.entryTitle = await p.title();
  log('entry:', p.url(), '|', out.entryTitle);
  if (/Вход/i.test(out.entryTitle)) {
    log('NOT LOGGED IN — session expired');
    writeFileSync(resolve(OUT, 'ground.json'), JSON.stringify(out, null, 2));
    await b.close();
    process.exit(2);
  }

  // ── A. Настройки компании: full left nav (incl. what is BELOW Ставки НДС) ──
  await gotoHash('companysettings');
  out.companySettingsUrl = p.url();
  await p.screenshot({ path: resolve(OUT, 'a-companysettings-full.png'), fullPage: true });
  out.settingsLeftNav = await dumpText({ maxX: 380 });
  out.companySettingsBody = await dumpText({ maxLen: 100 });
  log('A companysettings nav items:', out.settingsLeftNav.length);

  // ── B. Сотрудники list ──
  await gotoHash('employee');
  out.employeeListUrl = p.url();
  await p.screenshot({ path: resolve(OUT, 'b-employee-list.png'), fullPage: true });
  out.employeeList = await dumpText({ maxLen: 100 });
  log('B employee list dumped:', out.employeeList.length);

  // ── C. Employee card (Бекзод) ──
  await gotoHash(`Employee/edit?id=${EMPLOYEE_EDIT_ID}`);
  out.employeeEditUrl = p.url();
  await p.screenshot({ path: resolve(OUT, 'c-employee-card.png'), fullPage: true });
  out.employeeCard = await dumpText({ maxLen: 120 });
  log('C employee card dumped:', out.employeeCard.length);

  // ── D. «Настроить права» matrix (read-only look, then leave via re-goto) ──
  const rightsClicked = await p.evaluate(() => {
    const cand = [...document.querySelectorAll('button, div, a, span')].filter(
      (el) => el.textContent.trim() === 'Настроить права',
    );
    for (const el of cand) {
      const r = el.getBoundingClientRect();
      if (r.width > 2) { el.click(); return true; }
    }
    return false;
  });
  log('D clicked Настроить права:', rightsClicked);
  if (rightsClicked) {
    await p.waitForTimeout(5000);
    await p.screenshot({ path: resolve(OUT, 'd-rights-matrix.png'), fullPage: true });
    out.rightsMatrix = await dumpText({ maxLen: 120 });
    log('D rights matrix dumped:', out.rightsMatrix.length);
  }

  // ── E. «История изменений» — click the «Изменения:» link on the card ──
  await gotoHash(`Employee/edit?id=${EMPLOYEE_EDIT_ID}`);
  const histClicked = await p.evaluate(() => {
    const cand = [...document.querySelectorAll('a, span, div')].filter((el) => {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
      return /Изменения:/.test(own);
    });
    for (const el of cand) {
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.y < 300) { el.click(); return el.textContent.trim().slice(0, 60); }
    }
    return null;
  });
  log('E clicked Изменения:', histClicked);
  await p.waitForTimeout(6000);
  out.historyUrl = p.url();
  await p.screenshot({ path: resolve(OUT, 'e-history-panel.png'), fullPage: true });
  out.historyPanel = await dumpText({ maxLen: 140 });
  log('E history dumped:', out.historyPanel.length, '| url:', out.historyUrl);

  writeFileSync(resolve(OUT, 'ground.json'), JSON.stringify(out, null, 2));
  log('DONE');
} catch (e) {
  log('ERR', e.message);
  writeFileSync(resolve(OUT, 'ground.json'), JSON.stringify(out, null, 2));
  process.exitCode = 1;
} finally {
  await b.close();
}
