/** Owner 2026-07-23: «kiritilgan narx qatorga qo'llanishi HAR bo'limda».
 * Live per-section proof: inline-add search → pick product → modal → enter a
 * custom price → row's price cell must show exactly that price. */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3100';
const PRODUCT_QUERY = process.env.PRODUCT_QUERY || 'AirPods';
const PRICE = '777000'; // major units typed into the modal
const ROUTES = (
  process.env.ROUTES ||
  'customer-orders/new,purchase-orders/new,supplies/new,invoices-in/new,invoices-out/new,demands/new,sales-returns/new,purchase-returns/new,enters/new,losses/new,moves/new,internal-orders/new,commission-reports/new'
).split(',');

let failed = 0;
const ok = (n, c, extra = '') => {
  if (!c) failed++;
  console.log(`${c ? 'PASS' : 'FAIL'} ${n}${extra ? ` — ${extra}` : ''}`);
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
page.setDefaultTimeout(20000);
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.fill('[data-test-id="login-email"]', 'admin@demo.local');
  await page.fill('[data-test-id="login-password"]', 'admin123');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !String(u).includes('/login'), { timeout: 30000 });

  for (const route of ROUTES) {
    try {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
      const add = page.locator('[data-test-id$="-add-input"]').first();
      await add.waitFor({ state: 'visible' });
      await add.click();
      await add.fill(PRODUCT_QUERY);
      const sugg = page
        .locator('[data-test-id="position-inline-add-suggestions"] button, [data-test-id="position-inline-add-suggestions"] [role="option"], [data-test-id="position-inline-add-suggestions"] li')
        .first();
      await sugg.waitFor({ state: 'visible' });
      await sugg.click();
      // ProductPickModal: qty + price
      const priceInput = page.locator('[data-test-id="product-pick-price"]');
      const modalSeen = await priceInput
        .waitFor({ state: 'visible', timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (!modalSeen) {
        ok(`${route}: narx-modal OCHILDI`, false, 'product-pick-price ko\'rinmadi');
        continue;
      }
      ok(`${route}: narx-modal OCHILDI`, true);
      await priceInput.fill(PRICE);
      await page.click('[data-test-id="product-pick-save"]');
      // the new row must show 777 000 — as cell TEXT or inside an editable
      // price INPUT (sales pages render price as a MoneyInput whose value is
      // not textContent).
      await page.waitForTimeout(800);
      const applied = await page.evaluate(() => {
        const norm = (x) => (x || '').replace(/[^0-9]/g, '');
        for (const el of document.querySelectorAll('table td, table input')) {
          const v = el instanceof HTMLInputElement ? el.value : el.textContent;
          if (norm(v).includes('777000')) return true;
        }
        return false;
      });
      ok(route + ': kiritilgan narx QATORGA tushdi (777 000)', applied);
    } catch (e) {
      ok(`${route}: EXCEPTION`, false, String(e).slice(0, 140));
    }
  }
} finally {
  await browser.close();
  console.log(failed ? `FAILED=${failed}` : 'ALL PASS');
}
