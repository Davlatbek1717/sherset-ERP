// READ-ONLY: locate the #commissionreport GRID column ⚙ by ATTRIBUTE (class/title/
// alt/src containing settings|gear|column|setting), click it, and read the menu —
// validated by the «Количество строк» (rows-per-page) marker so we never mistake a
// filter dropdown for it. Dumps the optional-column checklist. Creds from .env.local.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/commission-reports-list-2026-06-27/moysklad');
mkdirSync(OUT, { recursive: true });
const env = {};
for (const line of readFileSync(resolve(REPO, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^(MOYSKLAD_[A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}
const SITE = env.MOYSKLAD_URL || 'https://online.moysklad.uz';
const EMAIL = env.MOYSKLAD_EMAIL;
const PASSWORD = env.MOYSKLAD_PASS || env.MOYSKLAD_PASSWORD;

const b = await chromium.launch({ headless: true });
const p = await (
  await b.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' })
).newPage();
p.setDefaultTimeout(45000);
p.setDefaultNavigationTimeout(120000);
const out = {};
const shot = (f) => p.screenshot({ path: resolve(OUT, f), fullPage: false }).catch(() => {});

// the column menu is the popup that contains «Количество строк» (rows-per-page)
const readColMenu = () =>
  p.evaluate(() => {
    const boxes = [...document.querySelectorAll('div, table, ul')].filter(
      (e) => /Количество строк/.test(e.textContent || '') && e.querySelector('input[type="checkbox"]'),
    );
    boxes.sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height);
    const box = boxes[0];
    if (!box) return { open: false };
    const items = [...box.querySelectorAll('label, li, tr, div')]
      .map((e) => {
        const cb = e.querySelector('input[type="checkbox"]');
        const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
        return cb && t && t.length > 1 && t.length < 40 ? { t, checked: cb.checked } : null;
      })
      .filter(Boolean);
    const seen = new Set();
    const u = [];
    for (const it of items) if (!seen.has(it.t)) { seen.add(it.t); u.push(it); }
    return { open: true, count: u.length, items: u };
  });

try {
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])')
    .first()
    .fill(EMAIL)
    .catch(() => {});
  await p.locator('input[type="password"]').first().fill(PASSWORD).catch(() => {});
  for (const s of ['button:has-text("Войти")', 'button[type="submit"]']) {
    const el = p.locator(s).first();
    if ((await el.count()) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      break;
    }
  }
  await p.waitForTimeout(12000);
  const base = p.url().split('#')[0];
  await p.goto(`${base}#commissionreport`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(12000);
  const cancel = p.locator('button:has-text("Отмена")').first();
  if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) {
    await cancel.click().catch(() => {});
    await p.waitForTimeout(800);
  }

  // collect attribute-matched gear candidates (header band, settings-ish)
  out.attrCandidates = await p.evaluate(() => {
    const hit = (s) => /settings|gear|column|setting|⚙/i.test(s || '');
    const res = [];
    for (const e of document.querySelectorAll('*')) {
      const r = e.getBoundingClientRect();
      if (!(r.top > 60 && r.top < 320 && r.width > 3 && r.width < 60 && r.height > 3 && r.height < 60)) continue;
      const cls = (e.className && e.className.toString) ? e.className.toString() : '';
      const title = e.getAttribute && (e.getAttribute('title') || '');
      const alt = e.getAttribute && (e.getAttribute('alt') || '');
      const src = e.getAttribute && (e.getAttribute('src') || '');
      const style = e.getAttribute && (e.getAttribute('style') || '');
      if (hit(cls) || hit(title) || hit(alt) || hit(src) || hit(style)) {
        res.push({
          tag: e.tagName,
          cls: cls.slice(0, 60),
          title: (title || '').slice(0, 30),
          src: (src || '').slice(-40),
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
          right: Math.round(r.right),
        });
      }
    }
    return res.sort((a, b) => b.right - a.right).slice(0, 12);
  });

  for (let i = 0; i < (out.attrCandidates || []).length; i++) {
    const c = out.attrCandidates[i];
    await p.mouse.click(c.x, c.y);
    await p.waitForTimeout(1200);
    const menu = await readColMenu();
    if (menu.open && menu.count >= 6) {
      out.winner = { index: i, point: { x: c.x, y: c.y, cls: c.cls, src: c.src }, menu };
      await shot('74-col-menu-found.png');
      break;
    }
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(300);
  }
} catch (e) {
  out.error = String(e).slice(0, 500);
}

writeFileSync(resolve(OUT, 'commission-gear-find.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
