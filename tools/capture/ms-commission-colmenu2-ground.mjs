// READ-ONLY: open the GRID column ⚙ via a real mouse-coordinate click at the far
// right of the header row, on BOTH #commissionreport AND #purchasereturn — to
// settle whether the user's column-menu screenshot (Со склада · Не оплачено · no
// commission-money cols) is commission or purchase-returns. Creds from .env.local.
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

const readMenu = () =>
  p.evaluate(() => {
    const pops = [
      ...document.querySelectorAll(
        '.gwt-PopupPanel, [role="menu"], [class*="dropdown"], [class*="Dropdown"], [class*="menu"], [class*="Menu"]',
      ),
    ].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 90 && r.height > 80 && r.top > 60 && e.querySelector('input[type="checkbox"]');
    });
    const last = pops[pops.length - 1];
    if (!last) return { open: false };
    const items = [...last.querySelectorAll('label, li, [role="menuitemcheckbox"], div, tr')]
      .map((e) => {
        const cb = e.querySelector('input[type="checkbox"]');
        const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
        return cb && t && t.length < 40 ? { t, checked: cb.checked } : null;
      })
      .filter(Boolean);
    const seen = new Set();
    const u = [];
    for (const it of items) if (!seen.has(it.t)) { seen.add(it.t); u.push(it); }
    return { open: true, count: u.length, items: u };
  });

// find the header-row gear's center coords (rightmost small clickable in header band)
const gearXY = () =>
  p.evaluate(() => {
    const cand = [...document.querySelectorAll('img, span, div, td, th, button')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return (
          r.top > 60 && r.top < 280 && r.left > window.innerWidth - 120 &&
          r.width > 5 && r.width < 40 && r.height > 5 && r.height < 40
        );
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), right: r.right };
      })
      .sort((a, b) => b.right - a.right);
    return cand[0] || null;
  });

async function login() {
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
  return p.url().split('#')[0];
}

async function grabColMenu(base, hash, tag) {
  await p.goto(`${base}#${hash}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(11000);
  const cancel = p.locator('button:has-text("Отмена")').first();
  if ((await cancel.count()) && (await cancel.isVisible().catch(() => false))) {
    await cancel.click().catch(() => {});
    await p.waitForTimeout(800);
  }
  const headers = await p.evaluate(() =>
    [...document.querySelectorAll('th')]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((t) => t && !/^[\d\s.,]+$/.test(t)),
  );
  const xy = await gearXY();
  let menu = { open: false };
  if (xy) {
    await p.mouse.click(xy.x, xy.y);
    await p.waitForTimeout(1300);
    menu = await readMenu();
    if (!menu.open) {
      // try a couple of nudged positions
      for (const dx of [-6, 6, -12]) {
        await p.mouse.click(xy.x + dx, xy.y);
        await p.waitForTimeout(1000);
        menu = await readMenu();
        if (menu.open) break;
      }
    }
  }
  await shot(`72-${tag}-colmenu.png`);
  out[tag] = { headers, gearXY: xy, menu };
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(500);
}

try {
  const base = await login();
  await grabColMenu(base, 'commissionreport', 'commission');
  await grabColMenu(base, 'purchasereturn', 'purchasereturn');
} catch (e) {
  out.error = String(e).slice(0, 500);
}

writeFileSync(resolve(OUT, 'commission-colmenu2-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
