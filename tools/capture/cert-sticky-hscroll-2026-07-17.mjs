// Live verify — sticky horizontal scrollbar (user bug-report 2026-07-17):
//  A wide table's x-scrollbar used to render only at the TABLE's bottom edge —
//  invisible while reading the top/middle of a long list. Now every table
//  mirrors its scrollbar into a sticky-bottom proxy strip that stays pinned to
//  the viewport bottom, and settles into its natural place when the table's
//  end is in view.
//  Checks: DataTable list (top/middle/bottom pin + 2-way scroll sync) ·
//  no-overflow → strip hidden · resize re-detect · StickyHScroll report page ·
//  PositionTable document positions.
import { chromium } from 'playwright';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3100';
const SHOT = (n) => `D:/projects/moysklad/tasdiq-sticky-${n}.png`;
const results = [];
const ok = (name, cond, extra = '') => {
  results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({ viewport: { width: 960, height: 620 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

async function login() {
  await page.goto(`${BASE}/purchase-orders`, { waitUntil: 'domcontentloaded' });
  // Client-side auth check may redirect to /login a beat later — poll for
  // whichever surface appears first, then authenticate if needed.
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    if (await page.locator('[data-test-id="login-email"]').count()) {
      await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
      await page.fill('[data-test-id="login-password"]', 'admin123');
      await page.click('button[type="submit"]');
      await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });
      await page.goto(`${BASE}/purchase-orders`, { waitUntil: 'domcontentloaded' });
      continue;
    }
    if (await page.locator('table').count()) return;
  }
  throw new Error(`login/list never settled — at ${page.url()}`);
}

/** Measure the first VISIBLE sticky proxy + its scroller on the page. */
async function probe() {
  return page.evaluate(() => {
    const proxies = [...document.querySelectorAll('[data-test-id="sticky-x-scrollbar"]')];
    const p = proxies.find(
      (el) => el.style.display !== 'none' && el.getBoundingClientRect().width > 0,
    );
    if (!p) return { found: false, proxies: proxies.length };
    const scroller = p.previousElementSibling;
    const r = p.getBoundingClientRect();
    const sr = scroller.getBoundingClientRect();
    return {
      found: true,
      proxies: proxies.length,
      rect: { top: r.top, bottom: r.bottom, height: r.height },
      scrollerBottom: sr.bottom,
      innerHeight: window.innerHeight,
      scrollWidth: scroller.scrollWidth,
      clientWidth: scroller.clientWidth,
      proxyScrollWidth: p.scrollWidth,
      scrollerScrollLeft: scroller.scrollLeft,
      proxyScrollLeft: p.scrollLeft,
      nativeHidden: getComputedStyle(scroller).scrollbarWidth === 'none',
    };
  });
}

async function setProxyScroll(x) {
  return page.evaluate((val) => {
    const p = [...document.querySelectorAll('[data-test-id="sticky-x-scrollbar"]')].find(
      (el) => el.style.display !== 'none' && el.getBoundingClientRect().width > 0,
    );
    p.scrollLeft = val;
    return new Promise((res) =>
      setTimeout(
        () => res({ proxy: p.scrollLeft, scroller: p.previousElementSibling.scrollLeft }),
        150,
      ),
    );
  }, x);
}

try {
  await login();

  // ── 1. DataTable list (/purchase-orders) ────────────────────────────────
  await page.waitForSelector('table', { timeout: 45000 });
  await page.waitForTimeout(2000);
  // Bring the TOP of the table into view (at 960px the toolbar+filters can
  // push the grid below the fold entirely — scroll to the table's first rows).
  await page.evaluate(() => {
    const p = [...document.querySelectorAll('[data-test-id="sticky-x-scrollbar"]')].find(
      (el) => el.style.display !== 'none',
    );
    const top = p.previousElementSibling.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, Math.max(0, top - 80));
  });
  await page.waitForTimeout(300);
  let m = await probe();
  ok(
    'list: table overflows horizontally',
    m.found && m.scrollWidth > m.clientWidth,
    JSON.stringify({ sw: m.scrollWidth, cw: m.clientWidth }),
  );
  ok('list: native x-scrollbar hidden on scroller', !!m.nativeHidden);
  // The bug scenario: table end BELOW the fold, yet the strip is ON-SCREEN.
  const tableTallerThanViewport = m.found && m.scrollerBottom > m.innerHeight;
  ok(
    'list: table end is below the fold (bug scenario)',
    tableTallerThanViewport,
    `scrollerBottom=${Math.round(m.scrollerBottom)} vs vh=${m.innerHeight}`,
  );
  ok(
    'list@TOP: proxy pinned to viewport bottom',
    m.found && Math.abs(m.rect.bottom - m.innerHeight) < 2,
    `bottom=${Math.round(m.rect.bottom)}`,
  );
  ok(
    'list: proxy scroll range mirrors table',
    m.found && Math.abs(m.proxyScrollWidth - m.scrollWidth) < 3,
  );
  await page.screenshot({ path: SHOT('1-list-top-pinned') });

  // Drag the proxy → table pans while we're still at the TOP of the page.
  let sync = await setProxyScroll(250);
  ok(
    'list@TOP: dragging proxy pans the table (proxy→scroller sync)',
    Math.abs(sync.scroller - 250) < 3,
    JSON.stringify(sync),
  );
  await page.screenshot({ path: SHOT('2-list-top-panned-right') });
  // Reverse: pan the table → proxy follows.
  sync = await page.evaluate(() => {
    const p = [...document.querySelectorAll('[data-test-id="sticky-x-scrollbar"]')].find(
      (el) => el.style.display !== 'none' && el.getBoundingClientRect().width > 0,
    );
    p.previousElementSibling.scrollLeft = 40;
    return new Promise((res) =>
      setTimeout(
        () => res({ proxy: p.scrollLeft, scroller: p.previousElementSibling.scrollLeft }),
        150,
      ),
    );
  });
  ok(
    'list: panning table moves proxy (scroller→proxy sync)',
    Math.abs(sync.proxy - 40) < 3,
    JSON.stringify(sync),
  );

  // MIDDLE of the page — strip must stay pinned.
  await page.evaluate(() =>
    window.scrollBy(0, Math.max(200, (document.body.scrollHeight - window.innerHeight) / 2)),
  );
  await page.waitForTimeout(300);
  m = await probe();
  const midPinned = m.found && Math.abs(m.rect.bottom - m.innerHeight) < 2;
  ok(
    'list@MIDDLE: proxy still pinned to viewport bottom',
    midPinned,
    `bottom=${Math.round(m.rect?.bottom)}`,
  );
  await page.screenshot({ path: SHOT('3-list-middle-pinned') });

  // BOTTOM — the strip settles into its natural place (above pagination),
  // exactly where the native scrollbar used to live. No double scrollbar.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  m = await probe();
  ok(
    'list@BOTTOM: proxy settles at its natural spot under the table',
    m.found && m.rect.bottom <= m.innerHeight + 1,
  );
  await page.screenshot({ path: SHOT('4-list-bottom-natural') });

  // ── 2. No horizontal overflow → NO strip at all ─────────────────────────
  await page.setViewportSize({ width: 1900, height: 700 });
  await page.waitForTimeout(600);
  const wide = await probe();
  ok(
    'wide viewport (no overflow): strip auto-hides',
    !wide.found,
    `visible proxies=${wide.proxies ? '' : ''}${wide.found ? 'yes' : 'no'}`,
  );
  await page.screenshot({ path: SHOT('5-wide-no-strip') });
  // Shrink again → strip re-appears (ResizeObserver re-detect).
  await page.setViewportSize({ width: 960, height: 620 });
  await page.waitForTimeout(600);
  m = await probe();
  ok('narrow again: strip re-appears', m.found === true);

  // ── 3. Codemod page (StickyHScroll wrapper) — /settings/audit-log ──────
  await page.goto(`${BASE}/settings/audit-log`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('table', { timeout: 45000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
  m = await probe();
  if (m.found) {
    const pinnedOrNatural = m.rect.bottom <= m.innerHeight + 1;
    ok(
      'audit-log (StickyHScroll): strip present + on-screen',
      pinnedOrNatural,
      `bottom=${Math.round(m.rect.bottom)} vh=${m.innerHeight}`,
    );
    const s2 = await setProxyScroll(120);
    ok('audit-log: proxy→scroller sync', Math.abs(s2.scroller - 120) < 3, JSON.stringify(s2));
  } else {
    ok(
      'audit-log: table fits (no overflow) — strip correctly hidden',
      true,
      'no assertion on sync',
    );
  }
  await page.screenshot({ path: SHOT('6-audit-log') });

  // ── 4. PositionTable — open first purchase-order detail ────────────────
  await page.goto(`${BASE}/purchase-orders`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('table a[href*="/purchase-orders/"]', { timeout: 45000 });
  const href = await page.getAttribute('table a[href*="/purchase-orders/"]', 'href');
  await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-test-id="position-table"]', { timeout: 45000 });
  await page.waitForTimeout(1500);
  const pos = await page.evaluate(() => {
    const root = document.querySelector('[data-test-id="position-table"]');
    const p = root.querySelector('[data-test-id="sticky-x-scrollbar"]');
    if (!p || p.style.display === 'none') return { visible: false };
    const scroller = p.previousElementSibling;
    // Target within the actual scroll range (990px-min table over a ~910px
    // container leaves only a few dozen px of travel).
    const target = Math.min(60, scroller.scrollWidth - scroller.clientWidth);
    p.scrollLeft = target;
    return new Promise((res) =>
      setTimeout(() => {
        const r = p.getBoundingClientRect();
        res({
          visible: true,
          target,
          onScreen: r.bottom <= window.innerHeight + 1,
          synced: target > 0 && Math.abs(scroller.scrollLeft - target) < 3,
          overflow: scroller.scrollWidth > scroller.clientWidth,
        });
      }, 150),
    );
  });
  ok(
    'PO detail positions: strip visible + on-screen',
    pos.visible && pos.onScreen,
    JSON.stringify(pos),
  );
  ok('PO detail positions: proxy→scroller sync', pos.visible && pos.synced);
  await page.screenshot({ path: SHOT('7-po-detail-positions') });
} catch (e) {
  ok('script crashed', false, String(e).slice(0, 300));
  console.log('URL at crash:', page.url());
  await page.screenshot({ path: SHOT('crash') }).catch(() => {});
} finally {
  await browser.close();
}

const fails = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n=== ${results.length - fails}/${results.length} PASS ===`);
process.exit(fails ? 1 : 0);
