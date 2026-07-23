import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const OUT = resolve('D:/projects/moysklad/docs/audits/profitability-1to1-2026-07-05');
mkdirSync(OUT, { recursive: true });
const WEB = 'http://localhost:3130';
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newContext({ viewport: { width: 1680, height: 950 }, locale: 'ru-RU' }).then(c => c.newPage());
page.setDefaultTimeout(45000);
const out = {};
try {
  await page.goto(`${WEB}/reports/profitability`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  if (await page.locator('input[type="password"]').first().isVisible().catch(()=>false)) {
    await page.fill('input[type="email"],input[name="email"]','admin@demo.local');
    await page.fill('input[type="password"]','admin123');
    await page.locator('input[type="password"]').press('Enter');
    await page.waitForTimeout(7000);
    await page.goto(`${WEB}/reports/profitability`, { waitUntil: 'domcontentloaded' });
  }
  await page.waitForSelector('[data-test-id="prof-tab-product"]', { timeout: 30000 });
  await page.waitForTimeout(3500);

  // (1) SUB-NAV — should be the Продажи sub-nav (Заказы покупателей...Прибыльность), NOT Reports (Обзор/Денежный поток)
  out.subnav = await page.evaluate(() => {
    const links = [...document.querySelectorAll('nav a, [class*="SubNav"] a, a')].map(a => (a.textContent||'').trim()).filter(Boolean);
    const has = (t) => links.some(l => l === t);
    return {
      salesNav: has('Заказы покупателям') || has('Заказы покупателей') || has('Отгрузки'),
      reportsNav: has('Денежный поток') && has('Взаиморасчёты'),
      profitabilityTab: has('Прибыльность'),
    };
  });

  // (2) COMPARE ROW — dropdown NOT disabled + 2 date inputs present
  out.compare = await page.evaluate(() => {
    const dd = document.querySelector('[data-test-id="prof-compare-period"]');
    const from = document.querySelector('[data-test-id="prof-compare-from"]');
    const to = document.querySelector('[data-test-id="prof-compare-to"]');
    return { dropdownDisabled: dd ? dd.disabled : null, dateFrom: !!from, dateTo: !!to,
      fromVal: from ? from.value : null, toVal: to ? to.value : null };
  });

  // (3) SERIES PILLS — rendered as buttons (not native selects)
  out.pills = await page.evaluate(() => {
    const s1 = document.querySelector('[data-test-id="prof-series1"]');
    const s2 = document.querySelector('[data-test-id="prof-series2"]');
    return { s1tag: s1 ? s1.tagName : null, s2tag: s2 ? s2.tagName : null,
      s1text: s1 ? (s1.textContent||'').trim() : null, s2text: s2 ? (s2.textContent||'').trim() : null };
  });
  await page.screenshot({ path: resolve(OUT, 'fix-chart-controls.png'), clip: { x: 0, y: 240, width: 1680, height: 200 } });

  // (4) GEAR — open, verify dropdown fully visible (not clipped by overflow)
  await page.click('[data-test-id="prof-gear"]');
  await page.waitForTimeout(900);
  out.gear = await page.evaluate(() => {
    const menu = document.querySelector('[data-test-id="prof-split-variants"]');
    if (!menu) return { splitVisible: false };
    const r = menu.getBoundingClientRect();
    return { splitVisible: r.width > 0 && r.height > 0, splitBottom: Math.round(r.bottom), viewportH: window.innerHeight,
      withinViewport: r.bottom <= window.innerHeight + 2 };
  });
  await page.screenshot({ path: resolve(OUT, 'fix-gear-open.png') });

  out.ok = true;
} catch (e) { out.error = String(e).slice(0,200); await page.screenshot({ path: resolve(OUT, 'fix-99-error.png') }).catch(()=>{}); }
finally { console.log(JSON.stringify(out, null, 1)); await browser.close(); }
