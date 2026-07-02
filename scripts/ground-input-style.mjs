// Live moysklad.uz grounding — MEASURE the text input + select computed style:
// border (color/width), border-radius, focus ring/outline/box-shadow, height.
// Reads creds from .env.local (NEVER printed). READ-ONLY (opens a create form,
// never saves). Goal: match moysklad inputs exactly (user: black crisp border,
// no radius, no outer focus ring). Saves JSON + screenshot to docs/audits/input-geom/.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/input-geom');
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
  const passEl = page.locator('input[type="password"]').first();
  const loginEl = page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
  await loginEl.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await loginEl.fill(EMAIL).catch(() => {});
  await passEl.fill(PASSWORD).catch(() => {});
  if ((await loginEl.inputValue().catch(() => '')).length === 0) {
    await loginEl.click().catch(() => {});
    await page.keyboard.type(EMAIL, { delay: 20 }).catch(() => {});
  }
  let submitted = false;
  for (const s of ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Войти")', '.login-button']) {
    const el = page.locator(s).first();
    if (await el.count() && await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); submitted = true; break; }
  }
  if (!submitted) await passEl.press('Enter').catch(() => {});
  await page.waitForTimeout(10000);
  log('url after login:', page.url());

  // Open the counterparty create form (lots of text inputs).
  const base = page.url().split('#')[0];
  await page.goto(base + '#company', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.goto(base + '#company/edit?new', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForSelector('text=Сохранить', { timeout: 60000 }).catch(() => log('no Сохранить'));
  await page.waitForTimeout(3000);

  const measure = await page.evaluate(() => {
    const cs = (el, props) => { const c = getComputedStyle(el); const o = {}; for (const p of props) o[p] = c[p]; return o; };
    const PROPS = ['height', 'borderTopWidth', 'borderTopColor', 'borderTopStyle', 'borderBottomColor', 'borderRadius', 'outlineWidth', 'outlineColor', 'outlineStyle', 'boxShadow', 'backgroundColor', 'color', 'fontSize'];
    // find a visible text input inside the form (not the global search)
    const inputs = [...document.querySelectorAll('input[type="text"], input:not([type])')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 80 && r.height > 10 && r.top > 60;
    });
    const out = { count: inputs.length };
    const el = inputs[0];
    if (el) {
      out.blur = cs(el, PROPS);
      el.focus();
      out.focus = cs(el, PROPS);
      el.blur();
    }
    return out;
  }).catch((e) => ({ error: e.message }));

  fs.writeFileSync(path.join(OUT, 'ms-input-geom.json'), JSON.stringify(measure, null, 2));
  log('MS INPUT GEOM:', JSON.stringify(measure, null, 2));
  await page.screenshot({ path: path.join(OUT, 'ms-input.png'), clip: { x: 0, y: 0, width: 900, height: 600 } }).catch(() => {});
  log('DONE →', OUT);
} catch (e) {
  log('ERROR:', e.message);
} finally {
  await browser.close();
}
