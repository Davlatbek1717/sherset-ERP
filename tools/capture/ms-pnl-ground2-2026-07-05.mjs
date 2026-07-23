// READ-ONLY grounding PASS 2 — moysklad «Прибыльность» interactions:
// Фильтр panel, Печать dropdown, chart dropdowns, Сравнить, tabs
// (По сотрудникам / По покупателям / По каналам продаж), header gear,
// row link href, pagination, График toggle, sort click.
// No mutation; only UI toggles that don't persist server data.
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

const clickText = (txt, yMax = 250) =>
  page.evaluate(
    ([wanted, y1]) => {
      for (const e of document.querySelectorAll('*')) {
        if (e.children.length) continue;
        const t = (e.textContent || '').trim();
        const r = e.getBoundingClientRect();
        if (t === wanted && r.y < y1 && r.width > 3) {
          const tgt = e.closest('a,button,div,td,label') || e;
          tgt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          tgt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          tgt.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return { x: Math.round(r.x), y: Math.round(r.y) };
        }
      }
      return null;
    },
    [txt, yMax],
  );

const leafs = (yMin, yMax, xMin = -10, xMax = 1790) =>
  page.evaluate(
    ([y0, y1, x0, x1]) => {
      const res = [];
      for (const e of document.querySelectorAll('*')) {
        if (e.children.length) continue;
        const r = e.getBoundingClientRect();
        const t = (e.textContent || '').trim();
        if (!t || r.width < 3 || r.height < 3) continue;
        if (r.y >= y0 && r.y < y1 && r.x >= x0 && r.x <= x1) {
          res.push({
            tag: e.tagName,
            t: t.slice(0, 70),
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            cls: (e.className && String(e.className).slice(0, 60)) || '',
          });
        }
      }
      res.sort((a, b) => a.y - b.y || a.x - b.x);
      return res.slice(0, 200);
    },
    [yMin, yMax, xMin, xMax],
  );

const popups = () =>
  page.evaluate(() => {
    const res = [];
    for (const p of document.querySelectorAll('.gwt-PopupPanel, [class*="popup"], [class*="Popup"]')) {
      const r = p.getBoundingClientRect();
      if (r.width > 60 && r.height > 30) {
        res.push({
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          text: (p.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 1200),
        });
      }
    }
    return res.slice(0, 4);
  });

const gotoPnl = async () => {
  await page.goto(`${SITE}/app/#pnl`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
};
const esc = async () => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
};

try {
  await gotoPnl();
  if (await page.locator('input[type="password"]').first().isVisible().catch(() => false)) {
    throw new Error('session expired');
  }

  // --- 1. Печать dropdown
  out.printClick = await clickText('Печать', 160);
  await page.waitForTimeout(1500);
  out.printMenu = await popups();
  await shot('10-print-menu.png');
  await esc();

  // --- 2. Фильтр panel
  out.filterClick = await clickText('Фильтр', 160);
  await page.waitForTimeout(2500);
  await shot('11-filter-panel.png');
  out.filterLeafs = await leafs(120, 700);
  out.filterPopups = await popups();
  // close filter back (click Фильтр again)
  await clickText('Фильтр', 160);
  await page.waitForTimeout(1500);

  // --- 3. chart series dropdown «Продажи (документы)»
  out.seriesClick = await clickText('Продажи (документы)', 400);
  await page.waitForTimeout(1500);
  out.seriesMenu = await popups();
  await shot('12-series-menu.png');
  await esc();

  // --- 4. orange «Выбрать показатель...»
  out.indicatorClick = await clickText('Выбрать показатель...', 400);
  await page.waitForTimeout(1500);
  out.indicatorMenu = await popups();
  await shot('13-indicator-menu.png');
  await esc();

  // --- 5. «С предыдущим периодом» dropdown
  out.cmpPeriodClick = await clickText('С предыдущим периодом', 260);
  await page.waitForTimeout(1200);
  out.cmpPeriodMenu = await popups();
  await shot('14-cmp-period-menu.png');
  await esc();

  // --- 6. Сравнить checkbox: check → capture, uncheck
  await page.evaluate(() => {
    const cb = [...document.querySelectorAll('input[type="checkbox"]')].find((e) => {
      const r = e.getBoundingClientRect();
      return r.y > 150 && r.y < 260;
    });
    cb?.click();
  });
  await page.waitForTimeout(2500);
  await shot('15-compare-on.png');
  out.compareLeafs = await leafs(150, 560);
  await page.evaluate(() => {
    const cb = [...document.querySelectorAll('input[type="checkbox"]')].find((e) => {
      const r = e.getBoundingClientRect();
      return r.y > 150 && r.y < 260;
    });
    if (cb?.checked) cb.click();
  });
  await page.waitForTimeout(1500);

  // --- 7. График toggle OFF → capture top area, then ON again
  await clickText('График', 160);
  await page.waitForTimeout(2500);
  await shot('16-chart-off.png');
  out.chartOffTop = await leafs(110, 360);
  await clickText('График', 160);
  await page.waitForTimeout(2000);

  // --- 8. header gear (top right of grid, ~x1765 near header row)
  const gear = await page.evaluate(() => {
    // the settings gear sits at the right edge of the column header row
    for (const e of document.querySelectorAll('*')) {
      const r = e.getBoundingClientRect();
      const cls = String(e.className || '');
      if (r.x > 1740 && r.y > 560 && r.y < 640 && r.width > 5 && r.width < 40 && /gear|settings|column/i.test(cls)) {
        e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return { cls: cls.slice(0, 60), x: Math.round(r.x), y: Math.round(r.y) };
      }
    }
    return null;
  });
  out.gearProbe = gear;
  if (!gear) {
    // fallback: click by coordinates on the gear glyph seen in the screenshot
    await page.mouse.click(1768, 600);
  }
  await page.waitForTimeout(1500);
  out.gearMenu = await popups();
  await shot('17-gear-menu.png');
  await esc();

  // --- 9. first row link href + click-through
  out.firstRowLink = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find((e) => {
      const r = e.getBoundingClientRect();
      return r.y > 610 && r.y < 700 && r.x < 400 && (e.textContent || '').trim().length > 3;
    });
    return a ? { t: (a.textContent || '').trim().slice(0, 50), href: a.getAttribute('href') } : null;
  });

  // --- 10. pagination: next page
  await page.evaluate(() => {
    // right-arrow pager button near «1-100 из ...»
    for (const e of document.querySelectorAll('*')) {
      const r = e.getBoundingClientRect();
      const cls = String(e.className || '');
      if (r.y > 970 && r.x > 180 && r.x < 260 && r.width < 30 && /next|forward|arrow|Image/i.test(cls)) {
        e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return cls;
      }
    }
    return null;
  });
  await page.waitForTimeout(3000);
  out.pagerAfterNext = await page.evaluate(() => {
    for (const e of document.querySelectorAll('.gwt-HTML')) {
      const t = (e.textContent || '').trim();
      if (/из/.test(t) && e.getBoundingClientRect().y > 960) return t;
    }
    return null;
  });

  // --- 11. Tabs: По сотрудникам / По покупателям / По каналам продаж
  for (const [key, label] of [
    ['employees', 'По сотрудникам'],
    ['customers', 'По покупателям'],
    ['channels', 'По каналам продаж'],
  ]) {
    await gotoPnl();
    out[`${key}Click`] = await clickText(label, 160);
    await page.waitForTimeout(6000);
    out[`${key}Url`] = page.url();
    await shot(`20-tab-${key}.png`);
    out[`${key}Head`] = await leafs(540, 720);
    out[`${key}Foot`] = await leafs(960, 1000);
  }

  // --- 12. sort: click «Прибыль» column header on По товарам
  await gotoPnl();
  await page.evaluate(() => {
    for (const e of document.querySelectorAll('*')) {
      if (e.children.length) continue;
      const t = (e.textContent || '').trim();
      const r = e.getBoundingClientRect();
      if (t === 'Прибыль' && r.y > 560 && r.y < 640) {
        (e.closest('div,td') || e).dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
      }
    }
    return false;
  });
  await page.waitForTimeout(4000);
  await shot('30-sort-profit.png', { clip: { x: 0, y: 540, width: 1780, height: 200 } });
  out.sortHead = await leafs(540, 660);

  out.ok = true;
} catch (e) {
  out.error = String(e).slice(0, 400);
  await shot('99-error2.png');
} finally {
  writeFileSync(resolve(OUT, '_ground-pass2.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ ok: out.ok, error: out.error }, null, 2));
  await browser.close();
}
