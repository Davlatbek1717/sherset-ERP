// Live moysklad.uz FULL counterparty-card grounding for the pixel-1:1 audit.
// Opens the SAME card the user referenced (Устасизлар Фаррухбек) and captures the
// default state + all-expanded + the left-column section structure. READ-ONLY.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/cp-card-pixel-2026-06-25');
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

// the card the user pointed at
const CP_ID = '9e1e8b86-4052-11f0-0a80-13720007f512';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1100 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const loginEl = page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
  await loginEl.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await loginEl.fill(EMAIL).catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASSWORD).catch(() => {});
  const submit = page.locator('button[type="submit"], button:has-text("Войти")').first();
  if (await submit.count()) await submit.click().catch(() => {});
  await page.waitForTimeout(10000);
  const base = page.url().split('#')[0];
  log('logged in:', page.url());

  await page.goto(base + '#company', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.goto(base + '#company/edit?id=' + CP_ID, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=О контрагенте', { timeout: 60000 }).catch(() => log('no О контрагенте'));
  await page.waitForTimeout(4000);

  // DEFAULT state (which sections are open/collapsed by default)
  await page.screenshot({ path: path.join(OUT, '00-default.png'), fullPage: true });
  // a viewport clip of the top (header + first cards + right widget tabs)
  await page.screenshot({ path: path.join(OUT, '00-top-viewport.png') });

  // capture the LEFT-column section titles in order + their collapsed/expanded state
  const sections = await page.evaluate(() => {
    const out = [];
    // moysklad section headers are bold labels with a ▼/▶ caret in the left card column (x<520)
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const t = (el.textContent || '').trim();
      if (!t || t.length > 40 || el.children.length > 3) continue;
      const r = el.getBoundingClientRect();
      if (r.left > 520 || r.width < 40 || r.height < 14 || r.height > 44) continue;
      if (/^(О контрагенте|Контактные лица|Дополнительные поля|Реквизиты|Скидки и цены|Доступ|Файлы|Адреса)$/.test(t)) {
        out.push({ title: t, y: Math.round(r.top), x: Math.round(r.left) });
      }
    }
    return out.sort((a, b) => a.y - b.y).filter((s, i, a) => i === 0 || a[i - 1].title !== s.title);
  });
  fs.writeFileSync(path.join(OUT, '00-left-sections.json'), JSON.stringify(sections, null, 2));
  log('left sections (default):', sections.map((s) => s.title).join(' | '));

  // capture full left-column field labels (role-grounded) for the field-by-field diff
  const labels = await page.evaluate(() => {
    const out = [];
    for (const el of Array.from(document.querySelectorAll('td, label, span, div'))) {
      if (el.children.length) continue;
      const t = (el.textContent || '').trim();
      if (!t || t.length > 36) continue;
      const r = el.getBoundingClientRect();
      if (r.left > 300 || r.width < 20 || r.top < 150) continue; // left label column band
      out.push({ t, x: Math.round(r.left), y: Math.round(r.top) });
    }
    return out.sort((a, b) => a.y - b.y);
  });
  fs.writeFileSync(path.join(OUT, '00-left-labels.json'), JSON.stringify(labels, null, 2));

  // full innerText for reference
  fs.writeFileSync(path.join(OUT, '00-text.txt'), await page.locator('body').innerText().catch(() => ''));

  log('DONE →', OUT);
} catch (e) {
  log('ERROR:', e.message);
  await page.screenshot({ path: path.join(OUT, 'zz-error.png') }).catch(() => {});
} finally {
  await browser.close();
}
