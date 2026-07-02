// Live moysklad.uz grounding for the Контрагент card «Задачи» (Tasks) tab.
// Strategy: query the real moysklad REST API for a TASK that has an agent (counterparty),
// open THAT counterparty's card so the «Задачи» tab is non-empty, click it, and capture a
// screenshot + the tab's outerHTML (element-role grounding, not just innerText).
// Reads creds/token from .env.local (NEVER printed). READ-ONLY.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/counterparty-card-1to1-2026-06-20/tasks-tab-2026-06-25');
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

// --- 1) find a counterparty that HAS a task (so the tab renders a real row) ---
let cpId = null;
let cpName = null;
try {
  const r = await fetch(`${API_BASE}/entity/task?limit=100&order=created,desc`, {
    headers: { Authorization: `Bearer ${API_TOKEN}`, Accept: 'application/json;charset=utf-8' },
  });
  const j = await r.json();
  const rows = j.rows || [];
  log('API tasks:', rows.length);
  // a task's `agent` is the Контрагент it concerns; meta.href ends with the cp id
  const withAgent = rows.find((t) => t.agent?.meta?.href?.includes('/counterparty/'));
  if (withAgent) {
    cpId = withAgent.agent.meta.href.split('/counterparty/')[1]?.split('?')[0];
    cpName = withAgent.agent.meta.href;
    log('task→agent counterparty id:', cpId, '| task:', withAgent.name);
  } else {
    log('no task with a counterparty agent — will fall back to a named counterparty');
  }
} catch (e) {
  log('task API fetch failed:', e.message);
}
// fallback: a counterparty likely to have CRM activity
if (!cpId) {
  try {
    const r = await fetch(`${API_BASE}/entity/counterparty?limit=30&order=name`, {
      headers: { Authorization: `Bearer ${API_TOKEN}`, Accept: 'application/json;charset=utf-8' },
    });
    const j = await r.json();
    const rows = j.rows || [];
    const pref = rows.find((c) => /Иброхим|Фиришкент|Устасизлар/i.test(c.name || '')) || rows[0];
    cpId = pref?.id; cpName = pref?.name;
    log('fallback counterparty:', cpName, cpId);
  } catch (e) { log('cp API fetch failed:', e.message); }
}

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

  // --- 2) open the counterparty card ---
  await page.goto(base + '#company', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  if (cpId) await page.goto(base + '#company/edit?id=' + cpId, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=О контрагенте', { timeout: 60000 }).catch(() => log('no О контрагенте card'));
  await page.waitForTimeout(4000);
  await shot(page, '00-card-initial');

  // --- 3) click the CARD's «Задачи» tab (NOT the top-nav menu item with the badge) ---
  // The card tab strip sits in the right widget (y > 250); the navbar item is at y ~30.
  const cands = page.locator('text="Задачи"');
  const n = await cands.count();
  let clicked = false;
  for (let i = 0; i < n; i++) {
    const el = cands.nth(i);
    const box = await el.boundingBox().catch(() => null);
    if (box && box.y > 250 && box.y < 360) {
      await el.click().catch((e) => log('tasks click fail', e.message));
      clicked = true;
      log('clicked CARD Задачи tab at y=', box.y);
      break;
    }
  }
  if (!clicked) log('CARD Задачи tab NOT found among', n, 'matches');
  await page.waitForTimeout(3500);
  await shot(page, '01-tasks-tab', true);

  // tight clip of the right widget (where the tab content lives)
  const widget = page.locator('text="Задачи"').first();
  try {
    const box = await widget.evaluate((el) => {
      // climb to a reasonably-sized container around the tab strip
      let n = el;
      for (let i = 0; i < 6 && n.parentElement; i++) n = n.parentElement;
      const r = n.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    log('widget box:', JSON.stringify(box));
  } catch (e) { log('box fail', e.message); }

  // dump innerText + the activity-area outerHTML for element-role grounding
  const bodyText = await page.locator('body').innerText().catch(() => '');
  fs.writeFileSync(path.join(OUT, '01-tasks-text.txt'), bodyText);

  // grab the HTML of the panel that contains «Задачи» (role grounding: button labels,
  // checkbox, due-date format, assignee display, grouping headers)
  const html = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const tabEl = all.find((e) => e.children.length === 0 && e.textContent?.trim() === 'Задачи');
    if (!tabEl) return document.body.outerHTML.slice(0, 200000);
    let n = tabEl;
    for (let i = 0; i < 9 && n.parentElement; i++) n = n.parentElement;
    return n.outerHTML;
  }).catch((e) => 'HTML grab failed: ' + e.message);
  fs.writeFileSync(path.join(OUT, '01-tasks-dom.html'), html);

  // --- 4) try to open the task CREATE affordance to ground the «+ Задача» flow ---
  for (const sel of ['button:has-text("Задача")', 'text="+ Задача"', 'text="Поставить задачу"']) {
    const b = page.locator(sel).first();
    if (await b.count()) {
      await b.click().catch(() => {});
      await page.waitForTimeout(2500);
      await shot(page, '02-task-create');
      log('opened create via', sel);
      break;
    }
  }

  log('DONE →', OUT);
} catch (e) {
  log('ERROR:', e.message);
  await shot(page, 'zz-error');
} finally {
  await browser.close();
}
