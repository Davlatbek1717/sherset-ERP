// Live moysklad.uz grounding for the Оприходование (#enter) section.
// Reads creds from .env.local (NEVER printed). Read-only — no create/save.
// Saves screenshots + DOM to docs/audits/enters-live-2026-06-21/.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/enters-live-2026-06-21');
fs.mkdirSync(OUT, { recursive: true });

// --- parse .env.local for MOYSKLAD_* (no echo) ---
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const URL = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('NO creds'); process.exit(2); }

const log = (...a) => console.log(...a);
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false }).catch(() => {});
};
const dumpDom = async (page, name) => {
  const html = await page.content().catch(() => '');
  fs.writeFileSync(path.join(OUT, name + '.html'), html);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);

try {
  log('1. goto', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await shot(page, '00-landing');

  // --- login ---
  log('2. login');
  const emailSel = ['input[placeholder="Логин"]', 'input[name="username"]', 'input[name="login"]', 'input[type="email"]', 'input[name="email"]', '#login', 'input[autocomplete="username"]', 'input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])'];
  let filledEmail = false;
  for (const s of emailSel) {
    const el = page.locator(s).first();
    if (await el.count() && await el.isVisible().catch(() => false)) { await el.fill(EMAIL); filledEmail = true; log('   email via', s); break; }
  }
  const passSel = ['input[name="password"]', 'input[type="password"]', '#password', 'input[autocomplete="current-password"]'];
  let filledPass = false;
  for (const s of passSel) {
    const el = page.locator(s).first();
    if (await el.count() && await el.isVisible().catch(() => false)) { await el.fill(PASSWORD); filledPass = true; log('   pass via', s); break; }
  }
  log('   filledEmail', filledEmail, 'filledPass', filledPass);
  await shot(page, '01-login-filled');
  // submit
  const submitSel = ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Войти")', 'button:has-text("Вход")', '.login-button'];
  for (const s of submitSel) {
    const el = page.locator(s).first();
    if (await el.count() && await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); log('   submit via', s); break; }
  }
  await page.waitForTimeout(8000);
  await shot(page, '02-after-login');
  log('   url after login:', page.url());

  // --- enter list ---
  log('3. goto #enter list');
  const base = page.url().split('#')[0];
  await page.goto(base + '#enter', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(7000);
  await shot(page, '10-enter-list');
  await dumpDom(page, '10-enter-list');

  // open the filter panel if there's a Фильтр button
  const filterBtn = page.locator('text=Фильтр').first();
  if (await filterBtn.count()) {
    await filterBtn.click().catch(() => {});
    await page.waitForTimeout(2500);
    await shot(page, '11-enter-list-filter');
    await dumpDom(page, '11-enter-list-filter');
    log('   filter opened');
  }

  // --- create form ---
  log('4. open create form');
  // moysklad create-new button is usually a green «+ Оприходование» or a + button
  const createSel = ['text=Оприходование', 'button:has-text("Добавить")', '.create-button', 'text=Создать'];
  let opened = false;
  // try the direct hash first
  await page.goto(base + '#enter/edit?id=&new=true', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(6000);
  let bodyTxt = await page.locator('body').innerText().catch(() => '');
  if (/Оприходование/i.test(bodyTxt)) { opened = true; log('   create via hash'); }
  await shot(page, '20-enter-create');
  await dumpDom(page, '20-enter-create');

  log('DONE. saved to', OUT);
} catch (e) {
  log('ERROR:', e.message);
  await shot(page, 'zz-error');
  await dumpDom(page, 'zz-error');
} finally {
  await browser.close();
}
