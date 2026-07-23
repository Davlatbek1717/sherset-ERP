// LIVE moysklad — supply editor 00905: capture Связанные документы + Задачи tabs
// (what «Привязать документ» / «Задача» look like) for 1:1 rebuild.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = 'D:/projects/moysklad/docs/audits/supply-live-audit-2026-07-06/tabs';
mkdirSync(OUT, { recursive: true });
const EDIT_ID = 'c3802589-7880-11f1-0a80-055500229daf';
const b = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await b.newContext({
  storageState: 'D:/projects/moysklad/.auth/moysklad.json',
  viewport: { width: 1400, height: 1000 },
  locale: 'ru-RU',
});
const p = await ctx.newPage();
p.setDefaultTimeout(45000);
const log = {};
const shot = (n) => p.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {});
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
async function clickTab(name) {
  return await p.evaluate((name) => {
    const el = [...document.querySelectorAll('[role="tab"], [class*="tab"] div, .tabName, li, a, span')].find(
      (x) => x.offsetParent !== null && (x.textContent || '').trim() === name,
    );
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, name);
}
try {
  await gotoRetry(`https://online.moysklad.ru/app/#supply/edit?id=${EDIT_ID}`);
  let ready = false;
  for (let i = 0; i < 22; i++) {
    await p.waitForTimeout(2000);
    ready = await p.evaluate(
      () => /Проведено/.test(document.body.textContent || '') && !!document.querySelector('.b-inlineeditor-table'),
    );
    if (ready) break;
  }
  log.ready = ready;

  // Связанные документы
  log.relatedClicked = await clickTab('Связанные документы');
  await p.waitForTimeout(2500);
  await shot('70-related');
  log.related = await p.evaluate(() => {
    const body = (document.body.textContent || '').replace(/\s+/g, ' ');
    return {
      hasPrivyazat: body.includes('Привязать документ'),
      hasPrivyazatShort: body.includes('Привязать'),
      // find the button labels in the related panel
      buttons: [...document.querySelectorAll('.b-popup-button, [role="button"], button')]
        .filter((x) => x.offsetParent !== null)
        .map((x) => (x.textContent || '').trim())
        .filter((t) => t && t.length < 40 && /Привяз|Создать|документ|связ/i.test(t))
        .slice(0, 10),
    };
  });

  // Задачи
  log.tasksClicked = await clickTab('Задачи');
  await p.waitForTimeout(2500);
  await shot('71-tasks');
  log.tasks = await p.evaluate(() => {
    const body = (document.body.textContent || '').replace(/\s+/g, ' ');
    return {
      hasZadacha: /Задача\b/.test(body),
      hasNetZadach: body.includes('Нет задач'),
      buttons: [...document.querySelectorAll('.b-popup-button, [role="button"], button')]
        .filter((x) => x.offsetParent !== null)
        .map((x) => (x.textContent || '').trim())
        .filter((t) => t && t.length < 30 && /Задач/i.test(t))
        .slice(0, 8),
    };
  });

  // Позиции (back) — confirm the positions toolbar
  log.posClicked = await clickTab('Позиции');
  await p.waitForTimeout(1500);
  await shot('72-positions');
} catch (e) {
  log.error = String(e).slice(0, 400);
  await shot('70-error');
}
writeFileSync(`${OUT}/TABS-LOG.json`, JSON.stringify(log, null, 2));
console.log(JSON.stringify(log, null, 2));
await b.close();
