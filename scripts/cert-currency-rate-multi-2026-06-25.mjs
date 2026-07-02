// LIVE CERT — «Валюта документа» USD rate now = account справочник (admin 12 200),
// NOT the CB feed (11 990,26), across the swept //new pages. For each route: open,
// select USD, read «1 USD = N UZS» → must be 12 200. 0 console errors per page.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3230';
const ROUTES = [
  'customer-orders/new',
  'demands/new',
  'invoices-out/new',
  'purchase-returns/new',
  'supplies/new',
];
const out = { pages: {}, consoleErrors: [] };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on('console', (m) => {
  if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 160));
});

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-test-id="login-submit"]').click().catch(() => {});
  await page
    .waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
    .catch(async () => {
      await page.locator('[data-test-id="login-password"]').press('Enter').catch(() => {});
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 }).catch(() => {});
    });

  for (const route of ROUTES) {
    try {
      await page.goto(`${BASE}/${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3500);
      // pick the currency <select> (the one carrying a USD option) and drive it via
      // Playwright's selectOption so React's onChange actually fires.
      const selInfo = await page.evaluate(() => {
        const sels = [...document.querySelectorAll('select')];
        const idx = sels.findIndex((s) =>
          [...s.options].some((o) => o.value === 'USD' || /доллар|USD/i.test(o.textContent || '')),
        );
        if (idx < 0) return null;
        const opt = [...sels[idx].options].find(
          (o) => o.value === 'USD' || /доллар|USD/i.test(o.textContent || ''),
        );
        return { idx, value: opt.value };
      });
      if (!selInfo) {
        out.pages[route] = 'NO_USD_OPTION';
        continue;
      }
      await page.locator('select').nth(selInfo.idx).selectOption(selInfo.value).catch(() => {});
      await page.waitForTimeout(2500);
      const body = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
      // admin rate = 12 200 ; CB feed = 11 990(,26). Look for either near "USD".
      const has12200 = /12[  ]?200/.test(body);
      const has11990 = /11[  ]?990/.test(body);
      out.pages[route] = has12200
        ? 'OK 12 200 (admin)'
        : has11990
          ? 'BAD still CB 11 990'
          : 'BAD no rate shown (harness could not drive select)';
    } catch (e) {
      out.pages[route] = `ERR ${String(e).slice(0, 60)}`;
    }
  }
} catch (e) {
  out.fatal = String(e).slice(0, 200);
}

out.consoleErrorCount = out.consoleErrors.length;
const pass = Object.values(out.pages).filter((v) => String(v).startsWith('OK')).length;
out.summary = `${pass}/${ROUTES.length} pages show admin rate 12 200 · ${out.consoleErrorCount} console-errors`;
console.log(JSON.stringify(out, null, 2));
await browser.close();
