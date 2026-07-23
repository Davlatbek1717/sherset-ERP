// LIVE CERT — boolean filter labels «Нет»/«Да» across the swept list pages.
// For each page: login, open «Фильтр», read the filter-applicable <select>
// options → must be ["", "Нет", "Да"] (was ["", "—", "✓"]). 0 console errors.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3219';
const PAGES = ['moves', 'customer-orders', 'supplies', 'demands', 'payments-in'];
const out = { pages: {}, consoleErrors: [] };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on('console', (m) => {
  if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 160));
});

const wanted = JSON.stringify(['', 'Нет', 'Да']);

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 15000 }).catch(() => {});
    });

  for (const slug of PAGES) {
    try {
      await page.goto(`${BASE}/${slug}`, { waitUntil: 'domcontentloaded' });
      await page.locator('thead th').first().waitFor({ timeout: 60000 });
      await page.waitForTimeout(1200);
      // open filter if there is a «Фильтр» toggle (some default-closed)
      await page.getByRole('button', { name: 'Фильтр', exact: true }).first().click().catch(() => {});
      await page.waitForTimeout(900);
      const opts = await page.evaluate(() => {
        const sel = document.querySelector('[data-test-id="filter-applicable"]');
        return sel ? [...sel.options].map((o) => (o.textContent || '').trim()) : null;
      });
      out.pages[slug] = opts;
    } catch (e) {
      out.pages[slug] = `ERR ${String(e).slice(0, 80)}`;
    }
  }
} catch (e) {
  out.fatal = String(e).slice(0, 200);
} finally {
  await browser.close();
}

out.consoleErrorCount = out.consoleErrors.length;
const pass = Object.entries(out.pages).filter(([, v]) => JSON.stringify(v) === wanted).length;
out.summary = `${pass}/${PAGES.length} pages show ["", "Нет", "Да"]`;
console.log(JSON.stringify(out, null, 2));
