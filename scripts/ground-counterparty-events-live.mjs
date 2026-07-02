// Live moysklad.uz grounding for the Контрагент card «События» (Events) tab.
// Gets a counterparty id from the real moysklad REST API, opens its card, clicks the
// «События» tab, and captures a screenshot + the activity-widget DOM.
// Reads creds/token from .env.local (NEVER printed). READ-ONLY.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/counterparty-card-1to1-2026-06-20/events-tab-2026-06-23');
fs.mkdirSync(OUT, { recursive: true });

const env = {};
for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const URL = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;
const API_BASE = env.MOYSKLAD_API_BASE || 'https://api.moysklad.ru/api/remap/1.2';
const API_TOKEN = env.MOYSKLAD_REAL_API_TOKEN || env.MOYSKLAD_API_TOKEN;
if (!EMAIL || !PASSWORD) { console.error('NO login creds'); process.exit(2); }

const log = (...a) => console.log(...a);
const shot = async (page, name, full = false) =>
  page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: full }).catch((e) => log('shot fail', name, e.message));

// --- 1) get a counterparty id (prefer one with sales activity) via the REST API ---
let cpId = null;
try {
  const r = await fetch(`${API_BASE}/entity/counterparty?limit=30&order=name`, {
    headers: { Authorization: `Bearer ${API_TOKEN}`, Accept: 'application/json;charset=utf-8' },
  });
  const j = await r.json();
  const rows = j.rows || [];
  log('API counterparties:', rows.length);
  // pick one whose name suggests activity, else the first
  const pref = rows.find((c) => /Иброхим|Фиришкент|Устасизлар/i.test(c.name || '')) || rows[0];
  cpId = pref?.id;
  log('chosen counterparty:', pref?.name, cpId);
} catch (e) {
  log('API fetch failed:', e.message);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  // login
  const loginEl = page.locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="submit"])').first();
  await loginEl.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await loginEl.fill(EMAIL).catch(() => {});
  await page.locator('input[type="password"]').first().fill(PASSWORD).catch(() => {});
  const submit = page.locator('button[type="submit"], button:has-text("Войти")').first();
  if (await submit.count()) await submit.click().catch(() => {});
  await page.waitForTimeout(10000);
  const base = page.url().split('#')[0];
  log('logged in:', page.url());

  // --- 2) open the counterparty card ---
  if (!cpId) { log('no cpId — opening list to grab one'); await page.goto(base + '#company', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(7000); }
  else { await page.goto(base + '#company', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2000); await page.goto(base + '#company/edit?id=' + cpId, { waitUntil: 'domcontentloaded' }); }
  await page.waitForSelector('text=О контрагенте', { timeout: 60000 }).catch(() => log('no О контрагенте card'));
  await page.waitForTimeout(4000);
  await shot(page, '00-card-initial');

  // --- 3) click the «События» tab ---
  const eventsTab = page.locator('text="События"').first();
  if (await eventsTab.count()) {
    await eventsTab.click().catch((e) => log('events click fail', e.message));
    await page.waitForTimeout(3500);
    log('clicked События');
  } else log('События tab NOT found');
  await shot(page, '01-events-tab', true);

  // dump the right-side activity area text + the events DOM for label grounding
  const bodyText = await page.locator('body').innerText().catch(() => '');
  fs.writeFileSync(path.join(OUT, '01-events-text.txt'), bodyText);

  log('DONE →', OUT);
} catch (e) {
  log('ERROR:', e.message);
  await shot(page, 'zz-error');
} finally {
  await browser.close();
}
