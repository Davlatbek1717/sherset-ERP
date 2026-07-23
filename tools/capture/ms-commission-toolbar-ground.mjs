import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// READ-ONLY: ground the #commissionreport «Изменить ▾» + «Печать ▾» toolbar dropdown
// menus (opened at 0-selection — items may be disabled, that's fine; we want the
// item LIST + order). Nothing changes. Creds from .env.local.
import { chromium } from 'playwright';

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
      return r.width > 80 && r.height > 25 && r.top > 100;
    });
    const last = pops[pops.length - 1];
    if (!last) return { open: false };
    const items = [...last.querySelectorAll('*')]
      .filter((e) => !e.children.length)
      .map((e) => {
        const t = (e.textContent || '').replace(/\s+/g, ' ').trim();
        const disabled =
          e.getAttribute('aria-disabled') === 'true' ||
          /disabled/i.test(e.className || '') ||
          e.closest('[class*="disabled"], [aria-disabled="true"]') != null;
        return t && t.length > 1 && t.length < 50 ? { t, disabled } : null;
      })
      .filter(Boolean);
    const seen = new Set();
    const u = [];
    for (const it of items)
      if (!seen.has(it.t)) {
        seen.add(it.t);
        u.push(it);
      }
    return { open: true, count: u.length, items: u };
  });

const clickToolbarBtn = (label) =>
  p.evaluate((lbl) => {
    const btn = [...document.querySelectorAll('button, a, span, div')].find((e) => {
      const r = e.getBoundingClientRect();
      return (
        (e.textContent || '').replace(/\s+/g, ' ').trim() === lbl &&
        r.top > 60 &&
        r.top < 200 &&
        r.width > 10
      );
    });
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }, label);

try {
  await p.goto(SITE, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(5000);
  await p
    .locator('input:not([type="password"]):not([type="hidden"]):not([type="checkbox"])')
    .first()
    .fill(EMAIL)
    .catch(() => {});
  await p
    .locator('input[type="password"]')
    .first()
    .fill(PASSWORD)
    .catch(() => {});
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

  // «Изменить ▾»
  out.izmenitClicked = await clickToolbarBtn('Изменить');
  await p.waitForTimeout(1200);
  await shot('80-izmenit-menu.png');
  out.izmenitMenu = await readMenu();
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(400);

  // «Печать ▾»
  out.pechatClicked = await clickToolbarBtn('Печать');
  await p.waitForTimeout(1200);
  await shot('81-pechat-menu.png');
  out.pechatMenu = await readMenu();
  await p.keyboard.press('Escape').catch(() => {});
} catch (e) {
  out.error = String(e).slice(0, 500);
}

writeFileSync(resolve(OUT, 'commission-toolbar-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
