// Live moysklad.uz grounding for the Контрагент create form (#company/edit?new).
// Reads creds from .env.local (NEVER printed). READ-ONLY — never clicks Сохранить.
// Expands every collapsible card so the full field structure is captured.
// Saves screenshots + DOM to docs/audits/counterparty-card-1to1-2026-06-20/live-2026-06-21/.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/counterparty-card-1to1-2026-06-20/live-2026-06-21');
fs.mkdirSync(OUT, { recursive: true });

// --- parse .env.local for MOYSKLAD_* (no echo of secrets) ---
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const URL = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD; // .env.local uses MOYSKLAD_PASS
if (!EMAIL || !PASSWORD) { console.error('NO creds (need MOYSKLAD_EMAIL + MOYSKLAD_PASS)'); process.exit(2); }

const log = (...a) => console.log(...a);
const shot = async (page, name, full = false) => {
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full }).catch((e) => log('  shot fail', name, e.message));
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);

try {
  log('1. goto', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  // --- login ---
  // The login form has two visible inputs: «Логин» (text) and «Пароль» (password).
  // Fill the password field, then the FIRST visible non-password text input = login.
  log('2. login as', EMAIL);
  const passEl = page.locator('input[type="password"]').first();
  const loginEl = page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
  await loginEl.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await loginEl.click().catch(() => {});
  await loginEl.fill(EMAIL).catch((e) => log('   login fill err', e.message));
  await passEl.fill(PASSWORD).catch((e) => log('   pass fill err', e.message));
  // verify the login field actually took the value (the earlier run left it empty)
  const loginVal = await loginEl.inputValue().catch(() => '');
  log('   login field filled non-empty:', loginVal.length > 0);
  if (loginVal.length === 0) {
    // retry via keyboard typing
    await loginEl.click().catch(() => {});
    await page.keyboard.type(EMAIL, { delay: 20 }).catch(() => {});
  }
  const submitSel = ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Войти")', 'button:has-text("Вход")', '.login-button'];
  let submitted = false;
  for (const s of submitSel) {
    const el = page.locator(s).first();
    if (await el.count() && await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); submitted = true; break; }
  }
  if (!submitted) { await passEl.press('Enter').catch(() => {}); }
  await page.waitForTimeout(10000);
  log('   url after login:', page.url());

  // --- create form ---
  log('3. open counterparty create form');
  const base = page.url().split('#')[0];
  // Boot the GWT app first (land on app, wait for the top chrome), then hash-nav to the form.
  await page.goto(base + '#company', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.goto(base + '#company/edit?new', { waitUntil: 'domcontentloaded' }).catch(() => {});
  // Wait for the GWT form to actually render — the «Сохранить» button + «О контрагенте» card.
  log('   waiting for form to render (GWT boot)…');
  await page.waitForSelector('text=Сохранить', { timeout: 60000 }).catch(() => log('   no Сохранить'));
  await page.waitForSelector('text=О контрагенте', { timeout: 30000 }).catch(() => log('   no О контрагенте card'));
  await page.waitForTimeout(3000);
  await shot(page, '00-create-initial');

  // Expand EVERY collapsible card. moysklad card headers are clickable rows that show
  // a ▶ (collapsed) / ▼ (expanded) chevron. Click each known card title to ensure it's open.
  const cardTitles = ['Налоги', 'О контрагенте', 'Контактные лица', 'Дополнительные поля', 'Реквизиты', 'Скидки и цены'];
  for (const title of cardTitles) {
    try {
      // The header is a row containing the title text; click it to toggle open.
      const header = page.locator(`text="${title}"`).first();
      if (await header.count()) {
        // Only click if the card looks collapsed: heuristic — check the chevron near it.
        // Simplest robust approach: click, wait, screenshot; if it collapsed an open one we re-open below.
        await header.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(300);
        // Detect collapsed by looking for a sibling with rotated/▶ chevron is unreliable in GWT;
        // instead we click only the 3 cards known-collapsed on a fresh form.
        log('   found card:', title);
      } else {
        log('   MISSING card:', title);
      }
    } catch (e) { log('   card err', title, e.message); }
  }

  // Click the 3 collapsed-by-default cards to expand them (Налоги, Контактные лица, Дополнительные поля).
  for (const title of ['Налоги', 'Контактные лица', 'Дополнительные поля']) {
    const header = page.locator(`text="${title}"`).first();
    if (await header.count()) {
      await header.click().catch((e) => log('   click fail', title, e.message));
      await page.waitForTimeout(1500);
      log('   expanded:', title);
    }
  }
  await page.waitForTimeout(1000);
  await shot(page, '01-all-expanded-full', true);

  // Dump the visible text of the form area for label grounding.
  const formText = await page.locator('body').innerText().catch(() => '');
  fs.writeFileSync(path.join(OUT, '01-form-text.txt'), formText);

  // Capture the input values (to see if Код / Внешний код auto-fill on a fresh form).
  const inputDump = await page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('input, textarea, select').forEach((el) => {
      const label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || '';
      rows.push({ tag: el.tagName, type: el.type || '', label, value: (el.value || '').slice(0, 60) });
    });
    return rows;
  }).catch(() => []);
  fs.writeFileSync(path.join(OUT, '01-inputs.json'), JSON.stringify(inputDump, null, 2));

  log('DONE. saved to', OUT);
} catch (e) {
  log('ERROR:', e.message);
  await shot(page, 'zz-error');
} finally {
  await browser.close();
}
