// Mobile width sweep — every main route at 390px; reports pages whose document
// scrollWidth exceeds the viewport + the deepest offending elements.
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:3100';
const LISTS = [
  '/',
  '/purchase-orders',
  '/invoices-in',
  '/supplies',
  '/purchase-returns',
  '/factures-in',
  '/customer-orders',
  '/invoices-out',
  '/demands',
  '/sales-returns',
  '/factures-out',
  '/commission-reports',
  '/products',
  '/services',
  '/bundles',
  '/variants',
  '/price-lists',
  '/serial-numbers',
  '/tracking-codes',
  '/counterparties',
  '/contracts',
  '/contact-persons',
  '/calls',
  '/loyalty-operations',
  '/discounts',
  '/moves',
  '/internal-orders',
  '/losses',
  '/enters',
  '/inventories',
  '/stores',
  '/turnover',
  '/picking-waves',
  '/payments',
  '/payments-in',
  '/payments-out',
  '/cash-in',
  '/cash-out',
  '/payrolls',
  '/counterparty-adjustments',
  '/reports/cash-flow',
  '/reports/pnl',
  '/reports/counterparty-balance',
  '/reports/profitability',
  '/reports/unit-economics',
  '/reports/purchase-management',
  '/tasks',
  '/retail',
  '/production',
  '/apps',
  '/hr',
  '/analitika',
  '/settings/company',
  '/settings/employees',
  '/ecommerce',
];
const NEWS = [
  '/purchase-orders/new',
  '/invoices-in/new',
  '/supplies/new',
  '/purchase-returns/new',
  '/customer-orders/new',
  '/invoices-out/new',
  '/demands/new',
  '/sales-returns/new',
  '/products/new',
  '/services/new',
  '/bundles/new',
  '/counterparties/new',
  '/contracts/new',
  '/moves/new',
  '/internal-orders/new',
  '/losses/new',
  '/enters/new',
  '/inventories/new',
  '/payments-in/new',
  '/payments-out/new',
  '/cash-in/new',
  '/cash-out/new',
  '/payrolls/new',
  '/counterparty-adjustments/new',
  '/price-lists/new',
  '/tasks',
];
const PAGES = [...new Set([...LISTS, ...NEWS])];
const W = 390;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: 844 }, locale: 'ru-RU' });
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
const bad = [];
for (const path of PAGES) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    const r = await page.evaluate((W) => {
      const inHScroll = (el) => {
        let n = el.parentElement;
        while (n && n !== document.body) {
          const ox = getComputedStyle(n).overflowX;
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
          n = n.parentElement;
        }
        return false;
      };
      const sw = document.documentElement.scrollWidth;
      if (sw <= W + 1) return { sw, list: [] };
      const out = [];
      for (const el of document.querySelectorAll('*')) {
        const rect = el.getBoundingClientRect();
        if ((rect.right > W + 1 || rect.left < -1) && !inHScroll(el)) {
          const ownOx = getComputedStyle(el).overflowX;
          let childToo = false;
          if (ownOx === 'visible') {
            for (const c of el.children) {
              if (c.getBoundingClientRect().right > W + 1) {
                childToo = true;
                break;
              }
            }
          }
          if (childToo) continue;
          out.push(
            `${Math.round(rect.width)}px <${el.tagName.toLowerCase()}> ${el.getAttribute('data-test-id') || el.getAttribute('data-testid') || ''} "${(el.textContent || '').trim().slice(0, 25)}" :: ${String(el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0, 80)}`,
          );
        }
      }
      return { sw, list: out.slice(0, 5) };
    }, W);
    const status = r.sw <= W + 1 ? 'OK ' : 'BAD';
    console.log(`${status} ${path} sw=${r.sw}`);
    if (r.sw > W + 1) {
      bad.push(path);
      for (const l of r.list) console.log(`      ${l}`);
    }
  } catch (e) {
    console.log(`ERR ${path} ${String(e).slice(0, 80)}`);
  }
}
console.log(`\n===== BAD: ${bad.length}/${PAGES.length}`);
await browser.close();
