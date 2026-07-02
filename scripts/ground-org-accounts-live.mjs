// Live moysklad.uz grounding: WHERE are an organization's bank accounts
// (Сум / Доллар / Клик / Терминал / Перечисления) managed in the UI?
// Reads creds from .env.local (NEVER printed). READ-ONLY — never saves/deletes.
// Walks: login → settings gear → «Мой компания»/organizations → open org → «Счета».
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/org-accounts-live-2026-06-21');
fs.mkdirSync(OUT, { recursive: true });

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const URL = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('NO creds'); process.exit(2); }

const log = (...a) => console.log(...a);
const shot = async (page, name, full = false) => {
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full }).catch((e) => log('  shot fail', name, e.message));
};
const dumpText = async (page, name) => {
  const txt = await page.locator('body').innerText().catch(() => '');
  fs.writeFileSync(path.join(OUT, name + '.txt'), txt);
  return txt;
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);

try {
  log('1. goto', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  log('2. login');
  const passEl = page.locator('input[type="password"]').first();
  const loginEl = page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
  await loginEl.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await loginEl.click().catch(() => {});
  await loginEl.fill(EMAIL).catch(() => {});
  await passEl.fill(PASSWORD).catch(() => {});
  const submitSel = ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Войти")', 'button:has-text("Вход")', '.login-button'];
  let submitted = false;
  for (const s of submitSel) {
    const el = page.locator(s).first();
    if (await el.count() && await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); submitted = true; break; }
  }
  if (!submitted) await passEl.press('Enter').catch(() => {});
  await page.waitForTimeout(10000);
  log('   url after login:', page.url());
  await shot(page, '00-after-login');

  const base = page.url().split('#')[0];

  // moysklad settings → organizations. Try the known hashes; capture each.
  // #mycompany historically = the account's own legal entities («Юр. лица» / organizations).
  for (const h of ['mycompany', 'settings', 'company']) {
    log('3. goto #' + h);
    await page.goto(base + '#' + h, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(6000);
    await shot(page, '10-hash-' + h, true);
    const t = await dumpText(page, '10-hash-' + h);
    log('   #' + h + ' has «Счет»:', /Счет|Счёт/.test(t), '| has org names:', /Касса|ООО|ИП|Фаррухбек|Камолиддин/.test(t));
  }

  // Open a specific organization (Фаррухбек Касса — from the user's screenshot) to reach its «Счета».
  log('4. open organization «Фаррухбек Касса»');
  await page.goto(base + '#mycompany', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(6000);
  const org = page.locator('text="Фаррухбек Касса"').first();
  if (await org.count()) {
    await org.click().catch((e) => log('   org click fail', e.message));
    await page.waitForTimeout(7000);
    await shot(page, '20-org-open', true);
    const t = await dumpText(page, '20-org-open');
    log('   org form has «Счет»:', /Счет|Счёт/.test(t), '| has Сум/Доллар:', /Сум|Доллар|Клик|Терминал/.test(t));
    // The org edit form has tabs/sections; click the «Счета» one.
    const acc = page.locator('text=/^Счет|^Счёт|Счета/').first();
    if (await acc.count()) {
      await acc.click().catch(() => {});
      await page.waitForTimeout(4000);
      await shot(page, '21-org-accounts', true);
      const t2 = await dumpText(page, '21-org-accounts');
      log('   accounts section has Сум/Доллар:', /Сум|Доллар|Клик|Терминал/.test(t2));
    } else {
      log('   no «Счета» tab text found — accounts may be inline on the form');
    }
  } else {
    log('   org «Фаррухбек Касса» not found in list');
  }

  log('DONE →', OUT);
} catch (e) {
  log('ERROR:', e.message);
  await shot(page, 'zz-error');
} finally {
  await browser.close();
}
