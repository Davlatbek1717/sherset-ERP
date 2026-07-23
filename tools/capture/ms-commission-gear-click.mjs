// READ-ONLY: click the #commissionreport GRID column ⚙ at its grounded pixel coord
// (~1622,204 — located visually in 00-list-full.png, the gear right of «Комментарий»)
// and dump the column checklist (validated by «Количество строк»). Creds from .env.local.
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

  // CLOSE the filter panel if it persisted open (it shifts the grid header down).
  const findBtnOpen = await p.evaluate(() =>
    [...document.querySelectorAll('*')].some((e) => !e.children.length && (e.textContent || '').trim() === 'Найти'),
  );
  if (findBtnOpen) {
    const fb = p.locator(':text-is("Фильтр") >> visible=true').first();
    if (await fb.count()) {
      await fb.click().catch(() => {});
      await p.waitForTimeout(1500);
    }
  }
  await shot('75-list-closed-filter.png');

  // The gear lives in the LAST grid <th> (a small settings column). Compute its
  // center dynamically + a few fallbacks just right of the «Комментарий» header.
  const targets = await p.evaluate(() => {
    const pts = [];
    const ths = [...document.querySelectorAll('th')].filter((e) => e.getBoundingClientRect().width > 0);
    const last = ths[ths.length - 1];
    if (last) {
      const r = last.getBoundingClientRect();
      pts.push({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), why: 'last-th' });
    }
    const comm = ths.find((e) => /Комментарий/.test(e.textContent || ''));
    if (comm) {
      const r = comm.getBoundingClientRect();
      pts.push({ x: Math.round(r.right + 16), y: Math.round(r.top + r.height / 2), why: 'right-of-comment' });
      pts.push({ x: Math.round(r.right + 28), y: Math.round(r.top + r.height / 2), why: 'right-of-comment+' });
    }
    return pts;
  });
  out.targets = targets;
  for (const t of targets) {
    await p.mouse.click(t.x, t.y);
    await p.waitForTimeout(1200);
    const menu = await readColMenu();
    if (menu.open && menu.count >= 6) {
      out.winner = { point: t, menu };
      await shot('76-col-menu.png');
      break;
    }
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(300);
  }
} catch (e) {
  out.error = String(e).slice(0, 500);
}

writeFileSync(resolve(OUT, 'commission-gear-click.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
