// Where does real moysklad manage «Отделы» (departments / Группа)? Login, open
// Настройки, dump the settings menu + find the departments section. READ-ONLY.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/departments-where');
fs.mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const URL = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL, PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('NO creds'); process.exit(2); }
const log = (...a) => console.log(...a);
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])').first().fill(EMAIL).catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASSWORD).catch(() => {});
  let ok = false;
  for (const s of ['button[type="submit"]', 'button:has-text("Войти")', '.login-button']) {
    const el = page.locator(s).first();
    if (await el.count() && await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); ok = true; break; }
  }
  if (!ok) await page.locator('input[type="password"]').first().press('Enter').catch(() => {});
  await page.waitForTimeout(10000);
  const base = page.url().split('#')[0];
  log('logged in:', page.url());

  // Try the settings/admin area. moysklad gear → Настройки.
  for (const hash of ['#admin', '#settings']) {
    await page.goto(base + hash, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(4000);
    const txt = await page.locator('body').innerText().catch(() => '');
    if (/Отдел|Сотрудник|Настройки/i.test(txt)) {
      log(`\n===== ${hash} settings menu (lines mentioning Отдел/Сотрудник/Доступ) =====`);
      for (const line of txt.split('\n').map((l) => l.trim()).filter(Boolean)) {
        if (/Отдел|Сотрудник|Доступ|Группа|Подразделен/i.test(line)) log('  •', line);
      }
      fs.writeFileSync(path.join(OUT, `menu${hash.replace('#', '-')}.txt`), txt);
      await page.screenshot({ path: path.join(OUT, `settings${hash.replace('#', '-')}.png`), fullPage: true }).catch(() => {});
      break;
    }
  }

  // Direct hashes commonly used for departments/employees in moysklad GWT.
  for (const hash of ['#department', '#employee', '#departmentList', '#admin/department']) {
    await page.goto(base + hash, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(3500);
    const url = page.url();
    const h1 = await page.locator('h1, .title, .header-title').first().innerText().catch(() => '');
    const hasOurDept = await page.locator('text=Сотув').count().catch(() => 0);
    log(`  ${hash} → ${url.includes('#') ? url.split('#')[1] : '(no hash)'} | title="${h1.slice(0, 40)}" | has «Сотув»: ${hasOurDept > 0}`);
    if (hasOurDept > 0) {
      await page.screenshot({ path: path.join(OUT, `dept${hash.replace(/[#/]/g, '-')}.png`), fullPage: true }).catch(() => {});
      log(`     ↑ DEPARTMENTS LIST here (${hash})`);
    }
  }
  log('\nDONE →', OUT);
} catch (e) { log('ERR', e.message); } finally { await browser.close(); }
