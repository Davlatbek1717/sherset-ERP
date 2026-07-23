// Large-monitor sweep (owner 2026-07-19): at ≥1600px the app content must be
// a CENTRED ≤1440px workspace (navy bar full-bleed). Verifies cap + centering
// on key pages at each width and saves a screenshot per page.
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3100';
const W = Number(process.env.W || 1920);
const PAGES = [
  ['home', '/'],
  ['po-list', '/purchase-orders'],
  ['po-new', '/purchase-orders/new'],
  ['products', '/products'],
  ['co-new', '/customer-orders/new'],
  ['moves', '/moves'],
  ['pnl', '/reports/pnl'],
  ['settings-emp', '/settings/employees'],
  ['settings-company', '/settings/company'],
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
for (let a = 0; a < 3; a++) {
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('button[type="submit"]');
  const left = await page
    .waitForURL((u) => !String(u).includes('/login'), { waitUntil: 'commit', timeout: 25000 })
    .then(() => true)
    .catch(() => false);
  if (left) break;
}

const results = [];
const ok = (name, cond, extra = '') => {
  results.push(cond);
  console.log(`${cond ? 'OK ' : 'BAD'} ${name}${extra ? ' — ' + extra : ''}`);
};

for (const [slug, path] of PAGES) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const m = await page.evaluate(() => {
    const main = document.querySelector('main > div');
    const navRow = document.querySelector('header.ms-navbar > div');
    const sw = document.documentElement.scrollWidth;
    const iw = window.innerWidth;
    const r = main ? main.getBoundingClientRect() : null;
    const n = navRow ? navRow.getBoundingClientRect() : null;
    return {
      sw,
      iw,
      contentW: r ? Math.round(r.width) : null,
      left: r ? Math.round(r.left) : null,
      right: r ? Math.round(iw - r.right) : null,
      navW: n ? Math.round(n.width) : null,
    };
  });
  if (W >= 1600) {
    ok(
      `${W} ${slug}: content capped ≤1441`,
      m.contentW !== null && m.contentW <= 1441,
      `w=${m.contentW}`,
    );
    ok(
      `${W} ${slug}: centred (sides even)`,
      m.left !== null && Math.abs(m.left - m.right) <= 2 && m.left > 0,
      `L=${m.left} R=${m.right}`,
    );
    ok(`${W} ${slug}: navbar row capped too`, m.navW !== null && m.navW <= 1441, `w=${m.navW}`);
  }
  ok(`${W} ${slug}: no h-overflow`, m.sw <= W + 1, `sw=${m.sw}`);
  await page.screenshot({ path: `D:/projects/moysklad/tasdiq-wide-${W}-${slug}.png` });
}
console.log(`\n===== ${results.filter(Boolean).length}/${results.length} PASS @ ${W}`);
await browser.close();
