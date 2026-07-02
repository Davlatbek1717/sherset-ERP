// v2 — capture DETAIL + dropdown/menu states for the #enter section.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/enters-live-2026-06-21');
fs.mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const URL = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const log = (...a) => console.log(...a);
const shot = async (page, name, full = false) => { await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full }).catch((e) => log('shot fail', name, e.message)); };
const dom = async (page, name) => { fs.writeFileSync(path.join(OUT, name + '.html'), await page.content().catch(() => '')); };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])').first().fill(env.MOYSKLAD_EMAIL);
  await page.locator('input[type="password"]').first().fill(env.MOYSKLAD_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(8000);
  const base = page.url().split('#')[0];
  log('logged in', base);

  // --- DETAIL: open the list, click the first document number link ---
  await page.goto(base + '#enter', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  // the № column links are anchors with text like 00011 / 0069-00001
  const firstLink = page.locator('a').filter({ hasText: /^\d{4,}/ }).first();
  if (await firstLink.count()) {
    await firstLink.click().catch(() => {});
    await page.waitForTimeout(6000);
    await shot(page, '30-detail', true);
    await dom(page, '30-detail');
    log('detail captured');
  } else { log('no detail link found'); }

  // --- back to list: open the column-settings gear on the grid ---
  await page.goto(base + '#enter', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  // gear is the last header cell — try clicking an element with a gear/settings class
  const gear = page.locator('.settings-button, [title="Настройки"], th .gear, .columns-settings').first();
  if (await gear.count()) { await gear.click().catch(() => {}); await page.waitForTimeout(2000); await shot(page, '12-list-col-gear'); await dom(page, '12-list-col-gear'); log('list gear'); }
  // Изменить dropdown
  const izm = page.locator('button:has-text("Изменить"), .button:has-text("Изменить")').first();
  if (await izm.count()) { await izm.click().catch(() => {}); await page.waitForTimeout(1500); await shot(page, '13-list-izmenit'); await dom(page, '13-list-izmenit'); log('izmenit'); await page.keyboard.press('Escape').catch(()=>{}); }

  // --- CREATE form: capture position column gear + Цена menu + Статус ---
  await page.goto(base + '#enter/edit?id=&new=true', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await shot(page, '21-create-full', true);
  await dom(page, '21-create-full');
  // position table gear (top-right of the positions table)
  const pgear = page.locator('.gear, [title="Настройки"], .settings-button').last();
  if (await pgear.count()) { await pgear.click().catch(() => {}); await page.waitForTimeout(1800); await shot(page, '22-create-pos-gear'); await dom(page, '22-create-pos-gear'); log('pos gear'); await page.keyboard.press('Escape').catch(()=>{}); await page.waitForTimeout(500); }
  // Цена dropdown
  const cena = page.locator('text=Цена').first();
  if (await cena.count()) { await cena.click().catch(() => {}); await page.waitForTimeout(1500); await shot(page, '23-create-cena-menu'); await dom(page, '23-create-cena-menu'); log('cena'); await page.keyboard.press('Escape').catch(()=>{}); await page.waitForTimeout(500); }
  // Статус dropdown
  const status = page.locator('button:has-text("Статус"), text=Статус').first();
  if (await status.count()) { await status.click().catch(() => {}); await page.waitForTimeout(1500); await shot(page, '24-create-status-menu'); await dom(page, '24-create-status-menu'); log('status'); await page.keyboard.press('Escape').catch(()=>{}); }
  // Валюта документа dropdown
  const val = page.locator('text=Валюта документа').first();
  if (await val.count()) { await val.click().catch(() => {}); await page.waitForTimeout(1200); await shot(page, '25-create-currency'); log('currency'); }
  log('DONE v2');
} catch (e) { log('ERR', e.message); await shot(page, 'zz-v2-error', true); await dom(page, 'zz-v2-error'); }
finally { await browser.close(); }
