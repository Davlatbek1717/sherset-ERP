// Live moysklad.uz grounding for the «Создание задачи» RIGHT slide-over (drawer).
// Opens a counterparty card → Задачи tab → «Создать задачу», captures the panel:
// screenshot + outerHTML + computed colours/box of the key elements. READ-ONLY.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'docs/audits/task-slideover-2026-06-25');
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
if (!EMAIL || !PASSWORD) { console.error('NO creds'); process.exit(2); }
const log = (...a) => console.log(...a);

// a counterparty WITH a task (so the Задачи tab + «Создать задачу» are present)
let cpId = '9e1e8b86-4052-11f0-0a80-13720007f512'; // Устасизлар Фаррухбек (user-referenced)
try {
  const r = await fetch(`${API_BASE}/entity/task?limit=50&order=created,desc`, {
    headers: { Authorization: `Bearer ${API_TOKEN}`, Accept: 'application/json;charset=utf-8' },
  });
  const j = await r.json();
  const withAgent = (j.rows || []).find((t) => t.agent?.meta?.href?.includes('/counterparty/'));
  if (withAgent) cpId = withAgent.agent.meta.href.split('/counterparty/')[1]?.split('?')[0] || cpId;
} catch (e) { log('task API fail (using default cp):', e.message); }

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
  log('logged in');

  await page.goto(base + '#company/edit?id=' + cpId, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=О контрагенте', { timeout: 60000 }).catch(() => log('no card'));
  await page.waitForTimeout(3500);

  // click the CARD «Задачи» tab (y > 250, NOT the navbar item)
  const tabs = page.locator('text="Задачи"');
  for (let i = 0; i < (await tabs.count()); i++) {
    const box = await tabs.nth(i).boundingBox().catch(() => null);
    if (box && box.y > 250 && box.y < 360) { await tabs.nth(i).click().catch(() => {}); break; }
  }
  await page.waitForTimeout(2500);

  // click «Создать задачу»
  const createBtn = page.locator('text="Создать задачу"').first();
  if (await createBtn.count()) {
    await createBtn.click().catch((e) => log('create click fail', e.message));
    await page.waitForTimeout(3000);
    log('clicked Создать задачу');
  } else log('«Создать задачу» NOT found');

  await page.screenshot({ path: path.join(OUT, '01-slideover-full.png') });

  // find the slide-over panel (the «Создание задачи» title's container) + capture HTML + styles
  const data = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const title = all.find((e) => e.children.length === 0 && /Создание задачи/.test(e.textContent || ''));
    if (!title) return { error: 'title not found', bodyText: document.body.innerText.slice(0, 2000) };
    // climb to the panel (a reasonably wide container on the right half of the screen)
    let panel = title;
    for (let i = 0; i < 12 && panel.parentElement; i++) {
      panel = panel.parentElement;
      const r = panel.getBoundingClientRect();
      if (r.width > 380 && r.width < 760 && r.left > 600) break;
    }
    const pr = panel.getBoundingClientRect();
    const cs = (el) => {
      if (!el) return null;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        text: (el.textContent || '').trim().slice(0, 30),
        bg: s.backgroundColor, color: s.color, fontSize: s.fontSize, fontWeight: s.fontWeight,
        box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      };
    };
    const byText = (re) => all.find((e) => e.children.length === 0 && re.test(e.textContent || ''));
    return {
      panel: { ...cs(panel), html: panel.outerHTML.slice(0, 60000) },
      title: cs(title),
      footerCreate: cs(byText(/^Создать задачу$/)),
      footerNotNow: cs(byText(/^Не сейчас$/)),
      labels: ['Описание задачи', 'Срок выполнения', 'Выполнена', 'Тип задачи', 'Исполнитель']
        .map((t) => ({ label: t, ...cs(byText(new RegExp('^' + t))) })),
    };
  });
  fs.writeFileSync(path.join(OUT, '01-slideover.json'), JSON.stringify(data, null, 2));
  if (data.panel?.html) fs.writeFileSync(path.join(OUT, '01-slideover-panel.html'), data.panel.html);
  log('panel box:', JSON.stringify(data.panel?.box));
  log('title:', JSON.stringify(data.title));
  log('labels:', (data.labels || []).map((l) => `${l.label}@${l.box?.y}`).join(' · '));

  // tight clip of the panel
  if (data.panel?.box?.w > 100) {
    await page.screenshot({
      path: path.join(OUT, '01-slideover-clip.png'),
      clip: { x: data.panel.box.x, y: Math.max(0, data.panel.box.y), width: data.panel.box.w, height: Math.min(1000, data.panel.box.h) },
    }).catch((e) => log('clip fail', e.message));
  }
  log('DONE →', OUT);
} catch (e) {
  log('ERROR:', e.message);
  await page.screenshot({ path: path.join(OUT, 'zz-error.png') }).catch(() => {});
} finally {
  await browser.close();
}
