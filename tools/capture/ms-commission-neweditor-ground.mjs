import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
// READ-ONLY: open BOTH commission-report create editors in real moysklad
// («Выданный отчёт комиссионера» = out, «Полученный отчёт комиссионера» = in) via the
// «⊕ Отчет комиссионера ▾» create menu, and ground the full form: toolbar buttons,
// header field labels (with positions so layout order is reconstructable), tab strip,
// and the positions-table column headers. NOTHING is saved (we never click Сохранить).
// Creds from .env.local (never printed).
import { chromium } from 'playwright';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs/audits/commission-reports-new-2026-06-28/moysklad');
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
const shot = (f, full = false) =>
  p.screenshot({ path: resolve(OUT, f), fullPage: full }).catch(() => {});

// Comprehensive editor DOM extraction.
const readEditor = () =>
  p.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const vis = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 1 && r.height > 1 && r.top >= 0 && r.top < 2500;
    };
    // 1) toolbar buttons (top band, y < 120)
    const toolbar = [
      ...new Set(
        [...document.querySelectorAll('button, a, span, div')]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.top > 40 && r.top < 120 && r.width > 8 && !e.children.length;
          })
          .map((e) => clean(e.textContent))
          .filter((t) => t && t.length < 28),
      ),
    ];
    // 2) every leaf text node in the editor area with its position (for layout order)
    const labels = [...document.querySelectorAll('*')]
      .filter((e) => !e.children.length && vis(e))
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { t: clean(e.textContent), top: Math.round(r.top), left: Math.round(r.left) };
      })
      .filter((o) => o.t && o.t.length > 0 && o.t.length < 60)
      .sort((a, c) => a.top - c.top || a.left - c.left);
    // 3) input / combo fields with nearest preceding label
    const fields = [...document.querySelectorAll('input, textarea, select')]
      .filter((e) => vis(e) && e.type !== 'hidden')
      .map((e) => {
        const r = e.getBoundingClientRect();
        return {
          type: e.type || e.tagName.toLowerCase(),
          placeholder: clean(e.placeholder),
          value: clean(e.value).slice(0, 40),
          top: Math.round(r.top),
          left: Math.round(r.left),
        };
      })
      .sort((a, c) => a.top - c.top || a.left - c.left);
    // 4) tab strip
    const tabs = [
      ...new Set(
        [...document.querySelectorAll('[class*="tab"], [class*="Tab"], [role="tab"]')]
          .filter(vis)
          .map((e) => clean(e.textContent))
          .filter((t) => t && t.length > 1 && t.length < 30),
      ),
    ];
    // 5) positions table column headers (th, or grid header cells)
    const tableHeaders = [
      ...new Set(
        [
          ...document.querySelectorAll(
            'th, [class*="header"] [class*="cell"], [class*="Header"] [class*="ell"], .gwt-Label',
          ),
        ]
          .filter((e) => {
            const r = e.getBoundingClientRect();
            return r.top > 150 && r.top < 900 && r.width > 8 && !e.children.length;
          })
          .map((e) => clean(e.textContent))
          .filter((t) => t && t.length > 0 && t.length < 30),
      ),
    ];
    return {
      url: location.hash,
      title: clean(document.title),
      toolbar,
      tabs,
      tableHeaders,
      fieldCount: fields.length,
      fields: fields.slice(0, 40),
      labels: labels.slice(0, 120),
    };
  });

const openCreate = async (variant, tag) => {
  // Open the green «⊕ Отчет комиссионера ▾» dropdown. The PROVEN opener is an
  // evaluate() click on the button's arrow child (run-1 confirmed the menu opens);
  // guard left>5 so we never match the hidden (0,0) GWT clone.
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button, a, span, div')].find((e) => {
      const r = e.getBoundingClientRect();
      return /^Отчет комиссионера/.test((e.textContent || '').trim()) && r.top < 200 && r.left > 5;
    });
    if (btn) (btn.querySelector('[class*="arrow"], [class*="Arrow"], img') || btn).click();
  });
  await p.waitForTimeout(1600);
  await shot(`${tag}-00-menu.png`);
  // Select the VISIBLE variant item via a real mouse click at its centre. GWT keeps
  // a hidden clone of the menu item at (0,0); filter top>140 & left>5 so we click the
  // OPEN menu, never the logo (clicking 0,0 navigated to #homepage last run).
  const box = await p.evaluate((label) => {
    const cands = [...document.querySelectorAll('*')].filter((e) => {
      if (e.children.length) return false;
      if ((e.textContent || '').replace(/\s+/g, ' ').trim() !== label) return false;
      const r = e.getBoundingClientRect();
      return r.width > 8 && r.height > 5 && r.top > 140 && r.left > 5;
    });
    if (!cands[0]) return null;
    const r = cands[0].getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  }, variant);
  out[`${tag}ItemBox`] = box;
  if (box && box.y > 140) await p.mouse.click(box.x, box.y);
  // the editor is loaded once a «Сохранить» toolbar button appears
  const loaded = await p
    .waitForFunction(() => /Сохранить/.test(document.body.innerText), { timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  await p.waitForTimeout(4000);
  return loaded;
};

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

  // ---- A) «Выданный отчёт комиссионера» (out) ----
  await p.goto(`${base}#commissionreport`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(11000);
  out.outLoaded = await openCreate('Выданный отчет комиссионера', 'out');
  out.outUrl = p.url().split('/').pop();
  await shot('out-01-full.png', true);
  await shot('out-02-top.png', false);
  out.out = await readEditor();

  // ---- B) «Полученный отчёт комиссионера» (in) ----
  await p.goto(`${base}#commissionreport`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(11000);
  out.inLoaded = await openCreate('Полученный отчет комиссионера', 'in');
  out.inUrl = p.url().split('/').pop();
  await shot('in-01-full.png', true);
  await shot('in-02-top.png', false);
  out.in = await readEditor();
} catch (e) {
  out.error = String(e).slice(0, 500);
}

writeFileSync(resolve(OUT, 'commission-neweditor-ground.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await b.close();
