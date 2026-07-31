// Customer-orders parity audit — MOYSKLAD detail-page ground truth (live).
// READ-ONLY: opens existing orders, expands menus, never saves/deletes.
// Usage: node scripts/co-capture-ms-detail.mjs [outDir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = process.argv[2] || path.join(ROOT, '.audit-co/moysklad');
fs.mkdirSync(OUT, { recursive: true });

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const BASE = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;

// Richest order first: 00002 is Отгружен + partially paid; 00005 is a fresh Новый.
const ORDERS = [
  ['00002', '39d40806-8e2f-11f0-0a80-109e001ce016'],
  ['00005', '15deeb50-84e0-11f1-0a80-1f240008d09b'],
];

const log = (...a) => console.log(...a);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);

const dismissNoise = async () => {
  await page
    .evaluate(() => {
      // Close promo popovers by clicking their × — identified by aria/class, never by guessing text.
      for (const el of document.querySelectorAll('[class*="close"],[class*="Close"]')) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.width < 60 && r.top < 1000) el.click();
      }
    })
    .catch(() => {});
  await page.waitForTimeout(600);
};

const snap = async (name, { full = false } = {}) => {
  await dismissNoise();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full }).catch((e) => log('  shot fail', name, e.message));
  fs.writeFileSync(path.join(OUT, `${name}.html`), await page.content().catch(() => ''), 'utf8');
  fs.writeFileSync(path.join(OUT, `${name}.txt`), await page.evaluate(() => document.body.innerText).catch(() => ''), 'utf8');
  log(`   [snap] ${name}`);
};

/** Click the first VISIBLE element whose trimmed text equals `t` (GWT-safe). */
const clickExact = async (t) => {
  const ok = await page
    .evaluate((txt) => {
      const cands = [...document.querySelectorAll('div,span,td,a,button')].filter((el) => {
        if ((el.innerText || '').replace(/\s+/g, ' ').trim() !== txt) return false;
        if (el.querySelector('div,span,td,a,button')) return false; // innermost only
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!cands.length) return false;
      cands[0].click();
      return true;
    }, t)
    .catch(() => false);
  if (!ok) log(`   no "${t}"`);
  await page.waitForTimeout(2200);
  return ok;
};

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const passEl = page.locator('input[type="password"]').first();
  const loginEl = page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
  await loginEl.waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  await loginEl.fill(EMAIL).catch(() => {});
  await passEl.fill(PASSWORD).catch(() => {});
  await passEl.press('Enter').catch(() => {});
  await page.waitForTimeout(12000);
  log('login ->', page.url());
  const base = page.url().split('#')[0];

  for (const [num, id] of ORDERS) {
    log(`\n== order ${num}`);
    await page.goto(`${base}#customerorder/edit?id=${id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Заказ покупателя', { timeout: 60000 }).catch(() => log('   form not rendered'));
    await page.waitForTimeout(6000);
    await snap(`40-detail-${num}`, { full: true });

    if (num === '00002') {
      for (const [t, name] of [
        ['Связанные документы', `41-detail-${num}-linked`],
        ['Главная', `42-detail-${num}-main`],
      ]) {
        if (await clickExact(t)) await snap(name, { full: true });
      }
      for (const [t, name] of [
        ['Изменить', `43-detail-${num}-menu-izmenit`],
        ['Создать документ', `44-detail-${num}-menu-sozdat`],
        ['Печать', `45-detail-${num}-menu-pechat`],
        ['Отправить', `46-detail-${num}-menu-otpravit`],
      ]) {
        if (await clickExact(t)) await snap(name);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(1000);
      }
      // positions grid gear = column chooser
      await page
        .evaluate(() => {
          const g = [...document.querySelectorAll('[class*="gear"],[class*="settings"],[class*="cog"]')].filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.top > 300;
          });
          if (g[0]) g[0].click();
        })
        .catch(() => {});
      await page.waitForTimeout(2000);
      await snap(`47-detail-${num}-pos-columns`);
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  log('\nDONE ->', OUT);
} catch (e) {
  log('FATAL', e.message);
  await snap('99-detail-fatal').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
