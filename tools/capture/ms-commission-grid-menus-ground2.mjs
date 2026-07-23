import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// READ-ONLY re-capture: «Комиссия ▾» + «⚙» gear on the commission-out position grid,
// cleanly (Escape-only between menus; auto-dismiss the unsaved-changes dialog). Confirms
// «Цена ▾» too. NOTHING saved. Creds from .env.local (never printed).
import { chromium } from 'playwright';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/commission-grid-menus-2026-06-29');
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

// Read the currently-open menu items by scanning short visible leaf texts that sit in a
// small popup box near the header band (top 450-560, left 700-1300). Returns ordered items.
const readMenuNear = (cx) =>
  p.evaluate((centerX) => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const cells = [...document.querySelectorAll('*')]
      .filter((e) => {
        if (e.children.length) return false;
        const t = clean(e.textContent);
        if (!t || t.length > 30) return false;
        const r = e.getBoundingClientRect();
        return r.top > 452 && r.top < 580 && r.left > centerX - 120 && r.left < centerX + 160 && r.width > 6;
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { t: clean(e.textContent), top: Math.round(r.top), left: Math.round(r.left) };
      })
      .sort((a, c) => a.top - c.top || a.left - c.left);
    // dedup consecutive
    const seen = new Set();
    return cells.filter((c) => (seen.has(c.t) ? false : (seen.add(c.t), true)));
  }, cx);

const dismissDialog = async () => {
  // «Сохранение изменений» → click «Отмена» (or «Нет») so nothing is saved + menu closes.
  for (const lbl of ['Отмена', 'Нет']) {
    const el = p.locator(`button:has-text("${lbl}"), td:has-text("${lbl}"), div[role="button"]:has-text("${lbl}")`).first();
    if ((await el.count().catch(() => 0)) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {});
      await p.waitForTimeout(500);
      return true;
    }
  }
  return false;
};
const esc = async () => {
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(400);
  await dismissDialog();
};

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
  await p.goto(`${base}#commissionreportout/edit?new`, { waitUntil: 'domcontentloaded' });
  await p
    .waitForFunction(() => /Сохранить/.test(document.body.innerText), { timeout: 40000 })
    .catch(() => {});
  await p.waitForTimeout(5000);

  // Dismiss the «Попробуйте новый дизайн» promo if present (click its ✕ — top-right of the card).
  await p.mouse.click(1655, 277).catch(() => {});
  await p.waitForTimeout(600);

  // Precise caret/gear x from the rendered grid header (y≈443).
  // 1) «Цена ▾»
  await p.mouse.click(783, 443).catch(() => {});
  await p.waitForTimeout(1100);
  await shot('11-price-menu.png');
  out.priceMenu = await readMenuNear(783);
  await esc();

  // 2) «Комиссия ▾»
  await p.mouse.click(1100, 443).catch(() => {});
  await p.waitForTimeout(1100);
  await shot('12-commission-menu.png');
  out.commissionMenu = await readMenuNear(1080);
  await esc();

  // 3) «⚙» gear
  await p.mouse.click(1132, 443).catch(() => {});
  await p.waitForTimeout(1300);
  await shot('13-gear-menu.png');
  // gear popup may be wider / lower — scan a broader box
  out.gearMenu = await p.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const cells = [...document.querySelectorAll('*')]
      .filter((e) => {
        if (e.children.length) return false;
        const t = clean(e.textContent);
        if (!t || t.length > 30) return false;
        const r = e.getBoundingClientRect();
        return r.top > 452 && r.top < 760 && r.left > 980 && r.left < 1400 && r.width > 6;
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { t: clean(e.textContent), top: Math.round(r.top), left: Math.round(r.left) };
      })
      .sort((a, c) => a.top - c.top || a.left - c.left);
    const seen = new Set();
    return cells.filter((c) => (seen.has(c.t) ? false : (seen.add(c.t), true)));
  });
  out.gearCheckboxes = await p.evaluate(() => {
    return [...document.querySelectorAll('input[type="checkbox"]')]
      .filter((c) => {
        const r = c.getBoundingClientRect();
        return r.top > 452 && r.top < 760 && r.left > 980;
      })
      .map((c) => ({ checked: c.checked, top: Math.round(c.getBoundingClientRect().top) }));
  });
  await esc();
} catch (e) {
  out.error = String(e).slice(0, 500);
}
writeFileSync(resolve(OUT, 'grid-menus-ground2.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
