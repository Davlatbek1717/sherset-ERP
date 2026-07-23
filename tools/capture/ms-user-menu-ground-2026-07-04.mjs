// READ-ONLY grounding — moysklad top-right header + the user/profile DROPDOWN
// and every item inside it (the user asked for 1:1). Captures: header cluster
// geometry/text, the opened dropdown (DOM text + screenshot), then clicks each
// dropdown item in turn and captures what opens (popup/page), navigating back.
// Creds from .env.local (internal, never printed). Never touches Сохранить.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO = 'D:/projects/moysklad';
const OUT = resolve(REPO, 'docs', 'audits', 'user-menu-2026-07-04');
mkdirSync(OUT, { recursive: true });
// This box has no .env.local creds — reuse the interactive login session saved
// by the 2026-07-03 stores grounding (storageState, gitignored).
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
const out = { items: [] };
const shot = (f, opts) => page.screenshot({ path: resolve(OUT, f), ...opts }).catch(() => {});

async function openUserMenu() {
  // the top-right user block: name + email + avatar; click it
  const clicked = await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (/climart_santex_group|Файзуллоев/.test(t) && r.y < 60 && r.x > 1200) {
        (e.closest('div,td,a') || e).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        e.click?.();
        return { t: t.slice(0, 40), x: Math.round(r.x), y: Math.round(r.y) };
      }
    }
    return null;
  });
  await page.waitForTimeout(2000);
  return clicked;
}

try {
  await page.goto(`${SITE}/app/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(10000);
  out.landedUrl = page.url();
  // Session check: if we were bounced to a login form, report honestly and stop.
  if (await page.locator('input[type="password"]').first().isVisible().catch(() => false)) {
    out.sessionExpired = true;
    await shot('99-login-bounce.png');
    throw new Error('saved session expired — interactive re-login needed');
  }
  const base = page.url().split('#')[0];

  // 00 — the top-right header cluster at rest (clip the right 700px of the header)
  await shot('00-header-right.png', { clip: { x: 1080, y: 0, width: 700, height: 64 } });
  // header cluster leaf texts + geometry
  out.headerLeafs = await page.evaluate(() => {
    const res = [];
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const r = e.getBoundingClientRect();
      const t = (e.textContent || '').trim();
      if (r.y >= 0 && r.y < 60 && r.x > 1080 && (t || e.tagName === 'IMG')) {
        res.push({ tag: e.tagName, t: t.slice(0, 42), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) });
      }
    }
    return res.slice(0, 40);
  });

  // open the user dropdown
  out.menuClick = await openUserMenu();
  await shot('10-user-menu-open.png');
  // capture the dropdown/popup DOM: popups in moysklad are gwt-PopupPanel
  out.menuText = await page.evaluate(() => {
    const pops = [...document.querySelectorAll('.gwt-PopupPanel, [class*="popup"], [class*="Popup"]')]
      .filter((p) => {
        const r = p.getBoundingClientRect();
        return r.width > 100 && r.height > 60 && r.y < 400;
      })
      .map((p) => (p.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 1500));
    return pops;
  });

  // enumerate clickable items inside the open popup
  const items = await page.evaluate(() => {
    const pop = [...document.querySelectorAll('.gwt-PopupPanel, [class*="popup"], [class*="Popup"]')]
      .filter((p) => {
        const r = p.getBoundingClientRect();
        return r.width > 100 && r.height > 60 && r.y < 500;
      })[0];
    if (!pop) return [];
    const res = [];
    for (const e of pop.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (t && r.width > 5) res.push({ t: t.slice(0, 50), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) });
    }
    return res.slice(0, 30);
  });
  out.popupItems = items;

  // click each item at its coordinates, capture the result, then return to base
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    // reopen menu fresh
    await page.goto(`${base}#homepage`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2500);
    await openUserMenu();
    await page.waitForTimeout(1000);
    await page.mouse.click(it.x, it.y).catch(() => {});
    await page.waitForTimeout(3000);
    const entry = { label: it.t, url: page.url() };
    const n = String(i + 1).padStart(2, '0');
    await shot(`2${n}-item-${i}.png`);
    // capture any popup text that appeared
    entry.resultText = await page.evaluate(() => {
      const pops = [...document.querySelectorAll('.gwt-PopupPanel, [class*="popup"], [class*="Popup"]')]
        .filter((p) => {
          const r = p.getBoundingClientRect();
          return r.width > 150 && r.height > 80;
        })
        .map((p) => (p.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 900));
      return pops.slice(0, 2);
    });
    out.items.push(entry);
  }
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-error.png');
} finally {
  writeFileSync(resolve(OUT, '_ground.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2).slice(0, 4000));
  await browser.close();
}
