// Customer-orders parity audit — MOYSKLAD ground-truth capture (live).
// READ-ONLY: never clicks Сохранить / Удалить / any mutating action.
// Creds come from .env.local (never printed). Output: screenshots + DOM dumps.
// Usage: node scripts/co-capture-moysklad.mjs [outDir]
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
if (!EMAIL || !PASSWORD) {
  console.error('NO creds in .env.local');
  process.exit(2);
}

const log = (...a) => console.log(...a);
const w = (name, data) => fs.writeFileSync(path.join(OUT, name), data, 'utf8');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);

/** Dismiss promo banners / popups that obscured the archived captures. */
const dismissNoise = async () => {
  const killers = [
    'text=Выбрать тариф >> xpath=../..//*[contains(@class,"close")]',
    '[class*="notification"] [class*="close"]',
    '[class*="popup"] [class*="close"]',
    '[class*="banner"] [class*="close"]',
  ];
  for (const k of killers) {
    const el = page.locator(k).first();
    if (await el.count().catch(() => 0)) await el.click({ timeout: 1500 }).catch(() => {});
  }
  // Never leave a "save changes?" modal on screen — answer «Нет» (discard), never «Да».
  const no = page.locator('button:has-text("Нет"), .btn:has-text("Нет")').first();
  if (await no.count().catch(() => 0) && (await no.isVisible().catch(() => false))) {
    await no.click().catch(() => {});
    await page.waitForTimeout(1000);
  }
};

const snap = async (name, { full = false } = {}) => {
  await dismissNoise();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full }).catch((e) => log('  shot fail', name, e.message));
  const html = await page.content().catch(() => '');
  w(`${name}.html`, html);
  const text = await page.evaluate(() => document.body.innerText).catch(() => '');
  w(`${name}.txt`, text);
  log(`   [snap] ${name}  html=${html.length}b text=${text.split('\n').length} lines`);
};

const hashGo = async (hash, waitText) => {
  const base = page.url().split('#')[0];
  await page.goto(base + hash, { waitUntil: 'domcontentloaded' }).catch(() => {});
  if (waitText) await page.waitForSelector(`text=${waitText}`, { timeout: 60000 }).catch(() => log('   waitText miss:', waitText));
  await page.waitForTimeout(4000);
};

/** Click a GWT element by exact visible text (read-only actions only). */
const clickText = async (t, note = '') => {
  const el = page.locator(`text="${t}"`).first();
  if (!(await el.count().catch(() => 0))) {
    log(`   no element "${t}" ${note}`);
    return false;
  }
  await el.click({ timeout: 8000 }).catch((e) => log(`   click "${t}" fail: ${e.message.slice(0, 80)}`));
  await page.waitForTimeout(2500);
  return true;
};

try {
  log('1. goto', BASE);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  log('2. login as', EMAIL);
  const passEl = page.locator('input[type="password"]').first();
  const loginEl = page
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])')
    .first();
  await loginEl.waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
  await loginEl.click().catch(() => {});
  await loginEl.fill(EMAIL).catch(() => {});
  await passEl.fill(PASSWORD).catch(() => {});
  if ((await loginEl.inputValue().catch(() => '')).length === 0) {
    await loginEl.click().catch(() => {});
    await page.keyboard.type(EMAIL, { delay: 25 }).catch(() => {});
  }
  let submitted = false;
  for (const s of ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Войти")', 'button:has-text("Вход")']) {
    const el = page.locator(s).first();
    if ((await el.count().catch(() => 0)) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      submitted = true;
      break;
    }
  }
  if (!submitted) await passEl.press('Enter').catch(() => {});
  await page.waitForTimeout(12000);
  log('   url after login:', page.url());
  await snap('00-after-login');
  if (/login|auth/i.test(page.url())) {
    log('   !!! LOGIN LIKELY FAILED — see 00-after-login.png');
  }

  // ---------- LIST ----------
  log('\n3. LIST #customerorder');
  await hashGo('#customerorder', 'Заказы покупателей');
  await snap('10-list-default', { full: true });

  log('   3a. open «Фильтр» panel');
  if (await clickText('Фильтр')) await snap('11-list-filter-open', { full: true });

  log('   3b. open column chooser «Столбцы»/«Настроить колонки»');
  if (!(await clickText('Столбцы'))) await clickText('Настроить колонки');
  await snap('12-list-columns', { full: true });
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(1500);

  log('   3c. toolbar menus: Изменить / Создать / Печать');
  for (const [t, name] of [
    ['Изменить', '13-list-menu-izmenit'],
    ['Создать', '14-list-menu-sozdat'],
    ['Печать', '15-list-menu-pechat'],
  ]) {
    if (await clickText(t)) await snap(name);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(1200);
  }

  // ---------- NEW ----------
  log('\n4. NEW #customerorder/edit?new');
  await hashGo('#customerorder/edit?new', 'Заказ покупателя');
  await snap('20-new-default', { full: true });

  log('   4a. toolbar menus on the form');
  for (const [t, name] of [
    ['Изменить', '21-new-menu-izmenit'],
    ['Создать документ', '22-new-menu-sozdat-dok'],
    ['Печать', '23-new-menu-pechat'],
    ['Отправить', '24-new-menu-otpravit'],
  ]) {
    if (await clickText(t)) await snap(name);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(1200);
  }

  log('   4b. status dropdown + positions column chooser');
  if (await clickText('Настроить колонки')) await snap('25-new-positions-columns');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(1200);

  log('   4c. tabs on the form');
  for (const [t, name] of [
    ['Связанные документы', '26-new-tab-linked'],
    ['Файлы', '27-new-tab-files'],
    ['Задачи', '28-new-tab-tasks'],
    ['Позиции', '29-new-tab-positions'],
  ]) {
    if (await clickText(t)) await snap(name);
  }

  // ---------- DETAIL ----------
  log('\n5. DETAIL — open first order from the list');
  await hashGo('#customerorder', 'Заказы покупателей');
  await dismissNoise();
  // grid row links look like #customerorder/edit?id=…
  const href = await page
    .evaluate(() => {
      const a = [...document.querySelectorAll('a[href*="customerorder/edit?id="]')][0];
      return a ? a.getAttribute('href') : null;
    })
    .catch(() => null);
  if (href) {
    log('   first order href:', href);
    await hashGo(href.startsWith('#') ? href : '#' + href.split('#').pop(), 'Заказ покупателя');
  } else {
    log('   no row link found — clicking first grid cell instead');
    const cell = page.locator('.gwt-Label, [class*="cell"]').filter({ hasText: /^\d{5}$/ }).first();
    if (await cell.count().catch(() => 0)) {
      await cell.click().catch(() => {});
      await page.waitForTimeout(6000);
    }
  }
  await snap('30-detail-default', { full: true });

  log('   5a. detail tabs');
  for (const [t, name] of [
    ['Связанные документы', '31-detail-tab-linked'],
    ['Файлы', '32-detail-tab-files'],
    ['Задачи', '33-detail-tab-tasks'],
    ['Позиции', '34-detail-tab-positions'],
  ]) {
    if (await clickText(t)) await snap(name);
  }

  log('   5b. detail toolbar menus');
  for (const [t, name] of [
    ['Изменить', '35-detail-menu-izmenit'],
    ['Создать документ', '36-detail-menu-sozdat-dok'],
    ['Печать', '37-detail-menu-pechat'],
    ['Отправить', '38-detail-menu-otpravit'],
  ]) {
    if (await clickText(t)) await snap(name);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(1200);
  }

  log('\nDONE ->', OUT);
} catch (e) {
  log('FATAL', e.message);
  await snap('99-fatal').catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
}
