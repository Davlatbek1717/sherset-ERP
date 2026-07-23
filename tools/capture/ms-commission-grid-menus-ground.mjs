import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// READ-ONLY: ground the moysklad «Выданный отчёт комиссионера» editor POSITION-GRID
// column menus — «Цена ▾», «Комиссия ▾», and the «⚙» gear. We open each, screenshot it,
// and extract its items/checkboxes so we know EXACTLY what they do (sort? price-type?
// column show/hide?) before cloning. NOTHING is saved. Creds from .env.local (never printed).
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

// Extract whatever popup/menu is currently open: its item rows (text + any checkbox state).
const readOpenMenu = () =>
  p.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    // Find the top-most visible popup/menu container that is NOT the whole document.
    const pops = [...document.querySelectorAll('*')].filter((e) => {
      const cls = e.className && e.className.baseVal ? e.className.baseVal : e.className || '';
      if (!/popup|opover|menu|dropdown|DropDown|Popup/i.test(String(cls))) return false;
      const r = e.getBoundingClientRect();
      return r.width > 30 && r.height > 10 && r.top > 100 && r.left > 5;
    });
    // smallest such container (the actual menu, not a wrapper)
    pops.sort((a, c) => {
      const ra = a.getBoundingClientRect();
      const rc = c.getBoundingClientRect();
      return ra.width * ra.height - rc.width * rc.height;
    });
    const menu = pops[0];
    if (!menu) return { found: false };
    const items = [];
    const seen = new Set();
    for (const el of menu.querySelectorAll('*')) {
      if (el.children.length) continue;
      const t = clean(el.textContent);
      if (!t || t.length > 40) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      items.push(t);
    }
    const checkboxes = [...menu.querySelectorAll('input[type="checkbox"]')].map((c) => ({
      checked: c.checked,
    }));
    return {
      found: true,
      rect: {
        top: Math.round(menu.getBoundingClientRect().top),
        left: Math.round(menu.getBoundingClientRect().left),
        w: Math.round(menu.getBoundingClientRect().width),
        h: Math.round(menu.getBoundingClientRect().height),
      },
      checkboxCount: checkboxes.length,
      checkboxes,
      items,
    };
  });

// Find a grid-header element by its visible text (e.g. «Цена», «Комиссия») and return the
// click-point at its dropdown caret (just right of the text). top in the header band.
const headerCaretBox = (label) =>
  p.evaluate((lbl) => {
    const cands = [...document.querySelectorAll('*')].filter((e) => {
      if (e.children.length) return false;
      if ((e.textContent || '').replace(/\s+/g, ' ').trim() !== lbl) return false;
      const r = e.getBoundingClientRect();
      return r.width > 4 && r.top > 380 && r.top < 520 && r.left > 5;
    });
    if (!cands[0]) return null;
    const r = cands[0].getBoundingClientRect();
    // click a few px right of the label text — that's where the ▾ caret sits.
    return { x: Math.round(r.right + 8), y: Math.round(r.top + r.height / 2), textRight: Math.round(r.right) };
  }, label);

const closeMenus = async () => {
  await p.keyboard.press('Escape').catch(() => {});
  await p.mouse.click(840, 700).catch(() => {}); // click empty area
  await p.waitForTimeout(500);
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

  // Direct to the «Выданный» create editor (stable hash).
  await p.goto(`${base}#commissionreportout/edit?new`, { waitUntil: 'domcontentloaded' });
  const loaded = await p
    .waitForFunction(() => /Сохранить/.test(document.body.innerText), { timeout: 40000 })
    .then(() => true)
    .catch(() => false);
  out.editorLoaded = loaded;
  await p.waitForTimeout(5000);
  await shot('00-grid.png');

  // Snapshot the header band coordinates so we can see where carets/gear are.
  out.headerBand = await p.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    return [...document.querySelectorAll('*')]
      .filter((e) => {
        if (e.children.length) return false;
        const r = e.getBoundingClientRect();
        return r.top > 380 && r.top < 520 && r.width > 3 && clean(e.textContent);
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { t: clean(e.textContent), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) };
      })
      .filter((o) => o.t.length < 24)
      .sort((a, c) => a.top - c.top || a.left - c.left);
  });

  // 1) «Цена ▾»
  const priceBox = await headerCaretBox('Цена');
  out.priceCaret = priceBox;
  if (priceBox) {
    await p.mouse.click(priceBox.x, priceBox.y).catch(() => {});
    await p.waitForTimeout(1200);
    await shot('01-price-menu.png');
    out.priceMenu = await readOpenMenu();
    await closeMenus();
  }

  // 2) «Комиссия ▾»
  const commBox = await headerCaretBox('Комиссия');
  out.commissionCaret = commBox;
  if (commBox) {
    await p.mouse.click(commBox.x, commBox.y).catch(() => {});
    await p.waitForTimeout(1200);
    await shot('02-commission-menu.png');
    out.commissionMenu = await readOpenMenu();
    await closeMenus();
  }

  // 3) «⚙» gear — the icon sits at the far right of the header band (after «Комиссия»).
  // Find a small clickable image/icon with top in the header band and the largest left.
  const gearBox = await p.evaluate(() => {
    const cand = [...document.querySelectorAll('img, [class*="gwt-Image"], [class*="icon"], span, div')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.top > 420 && r.top < 470 && r.left > 1080 && r.width > 6 && r.width < 40 && r.height < 30;
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), left: Math.round(r.left) };
      })
      .sort((a, c) => c.left - a.left);
    return cand[0] || null;
  });
  out.gearBox = gearBox;
  if (gearBox) {
    await p.mouse.click(gearBox.x, gearBox.y).catch(() => {});
    await p.waitForTimeout(1300);
    await shot('03-gear-menu.png');
    out.gearMenu = await readOpenMenu();
    await closeMenus();
  }
} catch (e) {
  out.error = String(e).slice(0, 500);
}

writeFileSync(resolve(OUT, 'grid-menus-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
