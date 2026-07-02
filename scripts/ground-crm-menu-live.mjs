// Live moysklad.uz grounding for the top-nav «CRM» menu — captures the dropdown
// sub-items so we can diff our CRM sub-nav against the real one. READ-ONLY.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/crm-menu-2026-06-25');
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

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
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

  // hover/click the top-nav «CRM» to reveal its dropdown
  const crm = page.locator('text="CRM"').first();
  await crm.scrollIntoViewIfNeeded().catch(() => {});
  await crm.hover().catch(() => {});
  await page.waitForTimeout(1500);
  await crm.click().catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, '01-crm-open.png') });

  // The CRM dropdown / second-level nav. Capture all visible link texts in the
  // header/menu region (top ~220px) so we get the sub-section labels in order.
  const items = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    for (const a of Array.from(document.querySelectorAll('a, [role="menuitem"], li'))) {
      const r = a.getBoundingClientRect();
      const txt = (a.textContent || '').trim();
      if (!txt || txt.length > 40) continue;
      if (r.top < 0 || r.top > 240 || r.width < 10) continue; // header/menu band only
      const key = txt + '@' + Math.round(r.left);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: txt, x: Math.round(r.left), y: Math.round(r.top) });
    }
    return out.sort((a, b) => a.y - b.y || a.x - b.x);
  });
  fs.writeFileSync(path.join(OUT, '01-crm-items.json'), JSON.stringify(items, null, 2));
  log('header-band items:', items.map((i) => i.text).join(' | '));

  // Also: navigate to Контрагенты and capture the SECOND-LEVEL CRM sub-nav strip
  await page.goto(base + '#company', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(OUT, '02-counterparties.png') });
  const subnav = await page.evaluate(() => {
    const out = [];
    const seen = new Set();
    for (const a of Array.from(document.querySelectorAll('a, [role="tab"], .button, span'))) {
      const r = a.getBoundingClientRect();
      const txt = (a.textContent || '').trim();
      if (!txt || txt.length > 40) continue;
      if (r.top < 40 || r.top > 130 || r.width < 10) continue; // second-level strip band
      const key = txt;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: txt, x: Math.round(r.left), y: Math.round(r.top) });
    }
    return out.sort((a, b) => a.x - b.x);
  });
  fs.writeFileSync(path.join(OUT, '02-subnav.json'), JSON.stringify(subnav, null, 2));
  log('2nd-level CRM strip:', subnav.map((i) => i.text).join(' | '));

  log('DONE →', OUT);
} catch (e) {
  log('ERROR:', e.message);
  await page.screenshot({ path: path.join(OUT, 'zz-error.png') }).catch(() => {});
} finally {
  await browser.close();
}
