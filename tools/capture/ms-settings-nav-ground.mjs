// READ-ONLY: ground moysklad's SETTINGS information architecture — where the
// profile-menu settings live and what the settings left-nav contains (does it
// have «Склады»? where do Юр. лица / Валюты / Единицы измерения sit?).
// Uses the saved interactive session (.auth/moysklad.json). Never saves/writes
// anything on the live account.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const OUT = resolve('D:/projects/moysklad/docs/audits/stores-1to1-2026-07-03');
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({
  storageState: 'D:/projects/moysklad/.auth/moysklad.json',
  viewport: { width: 1680, height: 1000 },
  locale: 'ru-RU',
});
const p = await ctx.newPage();
p.setDefaultTimeout(30000);
const out = { steps: [] };
const log = (...a) => { out.steps.push(a.join(' ')); console.log(...a); };

const dumpMenus = () => p.evaluate(() => {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const pops = [...document.querySelectorAll('body > div')].filter(d => {
    const r = d.getBoundingClientRect();
    const cs = getComputedStyle(d);
    return r.width > 60 && r.height > 20 && (cs.position === 'absolute' || cs.position === 'fixed') && cs.visibility !== 'hidden';
  });
  return pops.map(pp => {
    const items = [...pp.querySelectorAll('td, div, a, span')].map(el => {
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
      const t = norm(own);
      if (!t) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 2) return null;
      return { t: t.slice(0, 50), y: Math.round(r.y), cls: (typeof el.className === 'string' ? el.className : '').slice(0, 40) };
    }).filter(Boolean);
    return { cls: (pp.className || '').slice(0, 50), items: items.slice(0, 60) };
  });
});

try {
  await p.goto('https://online.moysklad.ru/app/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(9000);
  out.entryUrl = p.url();
  out.entryTitle = await p.title();
  log('entry:', out.entryUrl, '|', out.entryTitle);
  if (/Вход/i.test(out.entryTitle)) {
    log('NOT LOGGED IN — session expired for real');
    writeFileSync(resolve(OUT, 'ms-settings-nav.json'), JSON.stringify(out, null, 2));
    await b.close();
    process.exit(2);
  }

  // 1. Open the top-right PROFILE menu (avatar / username area) and dump it —
  //    this is where moysklad exposes «Настройки».
  await p.mouse.click(1632, 30); // avatar + arrow area (from earlier ground: cms-image-panel @1622,32)
  await p.waitForTimeout(1500);
  out.profileMenu = await dumpMenus();
  await p.screenshot({ path: resolve(OUT, 'ms-profile-menu.png') });
  log('profileMenu popups:', out.profileMenu.length);

  // 2. Click «Настройки» in that menu if present.
  const clicked = await p.evaluate(() => {
    const cand = [...document.querySelectorAll('td, div, a, span')].filter(el => el.textContent.trim() === 'Настройки');
    for (const el of cand) {
      const r = el.getBoundingClientRect();
      if (r.width > 2 && r.y > 40 && r.y < 400) { el.click(); return true; }
    }
    return false;
  });
  log('clicked Настройки:', clicked);
  await p.waitForTimeout(8000);
  out.settingsUrl = p.url();
  log('settings url:', out.settingsUrl);
  await p.screenshot({ path: resolve(OUT, 'ms-settings-page.png'), fullPage: true });

  // 3. Dump the settings page LEFT NAV + submenu tabs — full text with geometry.
  out.settingsNav = await p.evaluate(() => {
    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const res = [];
    for (const el of document.querySelectorAll('a, span, div, td')) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.y < 55) continue;
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
      const t = norm(own);
      if (!t || t.length > 60) continue;
      res.push({ t, box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], cls: (typeof el.className === 'string' ? el.className : '').slice(0, 45) });
    }
    return res;
  });

  // 4. Global check: any «Склад» mention on the settings screen?
  out.skladMentions = out.settingsNav.filter(x => /склад/i.test(x.t));
  log('склад mentions on settings screen:', JSON.stringify(out.skladMentions));

  writeFileSync(resolve(OUT, 'ms-settings-nav.json'), JSON.stringify(out, null, 2));
  log('DONE');
} catch (e) {
  log('ERR', e.message);
  writeFileSync(resolve(OUT, 'ms-settings-nav.json'), JSON.stringify(out, null, 2));
} finally {
  await b.close();
}
