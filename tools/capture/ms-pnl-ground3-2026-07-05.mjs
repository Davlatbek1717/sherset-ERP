// READ-ONLY grounding PASS 3 — Печать menu, filter select options, sort
// behavior, employees group header, row link hrefs, help icon, pager buttons.
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

const popups = () =>
  page.evaluate(() => {
    const res = [];
    for (const p of document.querySelectorAll('.gwt-PopupPanel, [class*="popup"], [class*="Popup"], [class*="menu"], [class*="Menu"]')) {
      const r = p.getBoundingClientRect();
      if (r.width > 60 && r.height > 20 && r.y >= 0) {
        const txt = (p.innerText || '').replace(/\n{2,}/g, '\n').trim();
        if (txt) res.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w || r.width), text: txt.slice(0, 800) });
      }
    }
    return res.slice(0, 5);
  });

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
          res.push({ tag: e.tagName, t: t.slice(0, 60), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), cls: (e.className && String(e.className).slice(0, 50)) || '' });
        }
      }
      res.sort((a, b) => a.y - b.y || a.x - b.x);
      return res.slice(0, 120);
    },
    [yMin, yMax],
  );

const gotoPnl = async () => {
  await page.goto(`${SITE}/app/#pnl`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
};

try {
  await gotoPnl();

  // --- 1. Печать: click by mouse at the button center (text 785..824, y131..145)
  await page.mouse.click(800, 138);
  await page.waitForTimeout(1800);
  out.printMenu = await popups();
  await shot('40-print-menu.png', { clip: { x: 600, y: 110, width: 700, height: 400 } });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);

  // --- 2. Help «?» icon left of the title (~x24,y137): title/href then hover
  out.helpIcon = await page.evaluate(() => {
    for (const e of document.querySelectorAll('a,div,span,img')) {
      const r = e.getBoundingClientRect();
      if (r.x > 10 && r.x < 45 && r.y > 120 && r.y < 155 && r.width > 8 && r.width < 40) {
        return {
          tag: e.tagName,
          cls: String(e.className || '').slice(0, 80),
          href: e.getAttribute && e.getAttribute('href'),
          title: e.getAttribute && e.getAttribute('title'),
        };
      }
    }
    return null;
  });

  // --- 3. refresh icon right of title
  out.refreshIcon = await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      const r = e.getBoundingClientRect();
      const cls = String(e.className || '');
      if (r.x > 195 && r.x < 235 && r.y > 125 && r.y < 155 && /refresh|update|reload/i.test(cls)) {
        return { tag: e.tagName, cls: cls.slice(0, 80) };
      }
    }
    return null;
  });

  // --- 4. Open Фильтр; enumerate select options + quick period links
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (t === 'Фильтр' && r.y < 160) {
        (e.closest('a,button,div,td') || e).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return;
      }
    }
  });
  await page.waitForTimeout(2500);
  out.filterSelects = await page.evaluate(() => {
    const res = [];
    for (const s of document.querySelectorAll('select')) {
      const r = s.getBoundingClientRect();
      if (r.width < 5) continue;
      res.push({
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        value: s.value,
        options: [...s.options].map((o) => o.textContent.trim()).slice(0, 20),
      });
    }
    return res;
  });
  // quick period links text + combobox arrow inventory
  out.filterQuickLinks = await page.evaluate(() => {
    const res = [];
    for (const e of document.querySelectorAll('a, span')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (r.y > 160 && r.y < 200 && t.length > 0 && t.length < 12) {
        res.push({ tag: e.tagName, t, x: Math.round(r.x), y: Math.round(r.y), cls: String(e.className || '').slice(0, 50) });
      }
    }
    return res.slice(0, 40);
  });
  // filter field labels with the dot markers
  out.filterLabels = await leafs(160, 320);

  // --- 5. combobox probe: click «Товар или группа» dropdown arrow and dump popup
  await page.evaluate(() => {
    // find the input under the «Товар или группа» label (x≈855..1090, y≈190..210)
    const inputs = [...document.querySelectorAll('input[type="text"]')].filter((i) => {
      const r = i.getBoundingClientRect();
      return r.y > 180 && r.y < 215 && r.x > 840 && r.x < 1100;
    });
    const inp = inputs[0];
    if (inp) {
      const arrow = inp.parentElement?.querySelector('div,img,span');
      inp.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      inp.focus();
    }
  });
  await page.waitForTimeout(2000);
  out.goodComboPopup = await popups();
  await shot('41-good-combo.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  // close filter
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (t === 'Фильтр' && r.y < 160) {
        (e.closest('a,button,div,td') || e).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return;
      }
    }
  });
  await page.waitForTimeout(1500);

  // --- 6. chart OFF → sort probe on «Прибыль» header
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (t === 'График' && r.y < 160) {
        (e.closest('a,button,div,td') || e).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return;
      }
    }
  });
  await page.waitForTimeout(3000);
  // click Прибыль header (now at y≈226)
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (t === 'Прибыль' && r.y > 200 && r.y < 250) {
        (e.closest('div,td') || e).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return;
      }
    }
  });
  await page.waitForTimeout(4000);
  await shot('42-sort-profit.png', { clip: { x: 0, y: 170, width: 1780, height: 300 } });
  out.sortHeadNoChart = await leafs(180, 330);
  // chart back ON (restore found state)
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (t === 'График' && r.y < 160) {
        (e.closest('a,button,div,td') || e).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return;
      }
    }
  });
  await page.waitForTimeout(2000);

  // --- 7. employees tab: group header band + row link
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (t === 'По сотрудникам' && r.y < 160) {
        (e.closest('a,button,div,td') || e).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return;
      }
    }
  });
  await page.waitForTimeout(6000);
  out.employeesFull = await leafs(500, 640);
  await shot('43-employees.png', { clip: { x: 0, y: 500, width: 1000, height: 200 } });

  // --- 8. customers tab first row link href
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (t === 'По покупателям' && r.y < 160) {
        (e.closest('a,button,div,td') || e).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return;
      }
    }
  });
  await page.waitForTimeout(6000);
  out.customerRowLinks = await page.evaluate(() => {
    const res = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const r = a.getBoundingClientRect();
      const t = (a.textContent || '').trim();
      if (r.y > 560 && r.y < 760 && r.x < 400 && t.length > 2) {
        res.push({ t: t.slice(0, 40), href: a.getAttribute('href') });
      }
    }
    return res.slice(0, 5);
  });

  // --- 9. pager buttons inventory (bottom-left)
  out.pagerButtons = await page.evaluate(() => {
    const res = [];
    for (const e of document.querySelectorAll('img, div, td')) {
      const r = e.getBoundingClientRect();
      const cls = String(e.className || '');
      if (r.y > 965 && r.y < 1000 && r.x < 260 && r.width > 4 && r.width < 40 && cls) {
        res.push({ tag: e.tagName, cls: cls.slice(0, 70), x: Math.round(r.x), w: Math.round(r.width) });
      }
    }
    return res.slice(0, 20);
  });

  out.ok = true;
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-error3.png');
} finally {
  writeFileSync(resolve(OUT, '_ground-pass3.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: out.ok, error: out.error }, null, 2));
  await browser.close();
}
