// READ-ONLY grounding PASS 4 — Печать menu (robust), help «?», pager button
// classes, «Разбить по модификациям» effect (toggle on → capture → toggle off).
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

try {
  await page.goto(`${SITE}/app/#pnl`, { waitUntil: 'domcontentloaded' });
  // wait until data rows are visible (a row link like #good/edit)
  await page.waitForSelector('a[href*="good/edit"]', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(3000);

  // --- 1. Печать: real mouse click at the SPAN center
  const printPos = await page.evaluate(() => {
    for (const e of document.querySelectorAll('span')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (t === 'Печать' && r.y < 160) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  });
  out.printPos = printPos;
  if (printPos) {
    await page.mouse.click(printPos.x, printPos.y);
    await page.waitForTimeout(2000);
    out.printMenu = await page.evaluate(() => {
      // any element that appeared as an overlay: high z-index, positioned
      const res = [];
      for (const p of document.querySelectorAll('body > *')) {
        const st = getComputedStyle(p);
        const r = p.getBoundingClientRect();
        if ((st.position === 'absolute' || st.position === 'fixed') && r.width > 60 && r.height > 20 && r.y > 100 && r.y < 500) {
          const txt = (p.innerText || '').replace(/\n{2,}/g, '\n').trim();
          if (txt) res.push({ cls: String(p.className || '').slice(0, 60), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), text: txt.slice(0, 500) });
        }
      }
      return res.slice(0, 6);
    });
    await shot('50-print-menu.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }

  // --- 2. help «?» icon: enumerate around title
  out.helpProbe = await page.evaluate(() => {
    const res = [];
    for (const e of document.querySelectorAll('*')) {
      const r = e.getBoundingClientRect();
      if (r.x > 5 && r.x < 45 && r.y > 118 && r.y < 158 && r.width > 6 && r.width < 45 && r.height < 45) {
        res.push({ tag: e.tagName, cls: String(e.className || '').slice(0, 70), href: e.getAttribute?.('href') || '', title: e.getAttribute?.('title') || '' });
      }
    }
    return res.slice(0, 10);
  });

  // --- 3. pager buttons: bottom area full inventory
  out.pagerArea = await page.evaluate(() => {
    const res = [];
    for (const e of document.querySelectorAll('*')) {
      const r = e.getBoundingClientRect();
      if (r.y > 965 && r.y < 1005 && r.x >= 0 && r.x < 300 && r.width >= 4 && r.width < 120) {
        const cls = String(e.className || '');
        const t = (e.textContent || '').trim();
        if (cls || (t && !e.children.length))
          res.push({ tag: e.tagName, cls: cls.slice(0, 70), t: t.slice(0, 20), x: Math.round(r.x), w: Math.round(r.width) });
      }
    }
    return res.slice(0, 30);
  });

  // --- 4. «Разбить по модификациям»: open gear, click the checkbox, capture rows, revert
  await page.mouse.click(1768, 600);
  await page.waitForTimeout(1500);
  const modClick = await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      if (t === 'Разбить по модификациям') {
        const row = e.closest('div,td,label');
        const cb = row?.parentElement?.querySelector('input[type="checkbox"]') || row?.querySelector('input[type="checkbox"]');
        if (cb) {
          cb.click();
          return { was: !cb.checked };
        }
        e.click?.();
        return { clickedLabel: true };
      }
    }
    return null;
  });
  out.modClick = modClick;
  await page.waitForTimeout(4000);
  await shot('51-split-variants.png', { clip: { x: 0, y: 540, width: 1780, height: 300 } });
  // revert
  await page.mouse.click(1768, 600);
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      if (t === 'Разбить по модификациям') {
        const row = e.closest('div,td,label');
        const cb = row?.parentElement?.querySelector('input[type="checkbox"]') || row?.querySelector('input[type="checkbox"]');
        if (cb?.checked) cb.click();
        return;
      }
    }
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  out.ok = true;
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-error4.png');
} finally {
  writeFileSync(resolve(OUT, '_ground-pass4.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2).slice(0, 3500));
  await browser.close();
}
