// READ-ONLY grounding — moysklad «Прибыльность» report (Продажи → 7th item).
// PASS 1 (exploratory): land on the report, capture the Продажи sub-nav order,
// the full page screenshot, every leaf text with geometry (tabs / toolbar /
// filter row / column headers / totals), and column header title attributes.
// No mutation: never clicks Сохранить, never edits anything.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs', 'audits', 'profitability-1to1-2026-07-05');
mkdirSync(OUT, { recursive: true });
const SITE = 'https://online.moysklad.ru';
const STATE = resolve(REPO, '.auth', 'moysklad.json');

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const ctx = await browser.newContext({
  viewport: { width: 1780, height: 1000 },
  locale: 'ru-RU',
  storageState: STATE,
});
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
page.setDefaultNavigationTimeout(120_000);
const out = {};
const shot = (f, opts) => page.screenshot({ path: resolve(OUT, f), ...opts }).catch(() => {});

// Every leaf element with text + geometry inside a y-band. This is the
// standard element-role capture (NOT grep-count) per label-grounding rules.
const leafs = (yMin, yMax) =>
  page.evaluate(
    ([y0, y1]) => {
      const res = [];
      for (const e of document.querySelectorAll('*')) {
        if (e.children.length) continue;
        const r = e.getBoundingClientRect();
        const t = (e.textContent || '').trim();
        if (!t || r.width < 3 || r.height < 3) continue;
        if (r.y >= y0 && r.y < y1) {
          res.push({
            tag: e.tagName,
            t: t.slice(0, 60),
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
            cls: (e.className && String(e.className).slice(0, 60)) || '',
          });
        }
      }
      res.sort((a, b) => a.y - b.y || a.x - b.x);
      return res.slice(0, 220);
    },
    [yMin, yMax],
  );

try {
  await page.goto(`${SITE}/app/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000);
  out.landedUrl = page.url();
  if (await page.locator('input[type="password"]').first().isVisible().catch(() => false)) {
    out.sessionExpired = true;
    await shot('99-login-bounce.png');
    throw new Error('saved session expired — interactive re-login needed');
  }
  const base = page.url().split('#')[0];

  // --- A. Продажи top-nav: click it, capture the sub-nav that appears
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (t === 'Продажи' && r.y < 90) {
        (e.closest('a,div,td') || e).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        e.click?.();
        return true;
      }
    }
    return false;
  });
  await page.waitForTimeout(5000);
  out.salesMenuUrl = page.url();
  out.salesSubnav = await leafs(20, 130);
  await shot('00-sales-subnav.png', { clip: { x: 0, y: 0, width: 1780, height: 140 } });

  // --- B. Click «Прибыльность» in the sub-nav
  const clickedPnl = await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (t === 'Прибыльность' && r.y < 140) {
        (e.closest('a,div,td') || e).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        e.click?.();
        return { x: Math.round(r.x), y: Math.round(r.y) };
      }
    }
    return null;
  });
  out.clickedPnl = clickedPnl;
  await page.waitForTimeout(8000);
  out.pnlUrl = page.url();
  await shot('01-pnl-full.png', { fullPage: false });

  // --- C. Full leaf dump in 3 bands: header/tabs (0-200), body (200-700), footer (700-1000)
  out.bandTop = await leafs(0, 210);
  out.bandBody = await leafs(210, 720);
  out.bandFoot = await leafs(720, 1000);

  // --- D. Column headers often carry title= attributes in moysklad grids
  out.colTitles = await page.evaluate(() => {
    const res = [];
    for (const e of document.querySelectorAll('[title]')) {
      const r = e.getBoundingClientRect();
      const ti = e.getAttribute('title');
      if (ti && r.width > 4 && r.y > 100 && r.y < 420) {
        res.push({ title: ti.slice(0, 60), t: (e.textContent || '').trim().slice(0, 40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) });
      }
    }
    res.sort((a, b) => a.y - b.y || a.x - b.x);
    return res.slice(0, 80);
  });

  // --- E. Inputs / selects / checkboxes visible on the page (filter widgets)
  out.widgets = await page.evaluate(() => {
    const res = [];
    for (const e of document.querySelectorAll('input, select, button, textarea')) {
      const r = e.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) continue;
      res.push({
        tag: e.tagName,
        type: e.type || '',
        value: (e.value || '').slice(0, 30),
        placeholder: (e.placeholder || '').slice(0, 40),
        checked: e.checked === true ? 1 : 0,
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        cls: (e.className && String(e.className).slice(0, 50)) || '',
      });
    }
    res.sort((a, b) => a.y - b.y || a.x - b.x);
    return res.slice(0, 80);
  });

  out.ok = true;
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-error.png');
} finally {
  writeFileSync(resolve(OUT, '_ground-pass1.json'), JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      { ok: out.ok, error: out.error, landedUrl: out.landedUrl, pnlUrl: out.pnlUrl, sessionExpired: out.sessionExpired },
      null,
      2,
    ),
  );
  await browser.close();
}
