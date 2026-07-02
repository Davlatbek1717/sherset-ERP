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
      // ensure the filter panel is OPEN (most default-closed). Click «Фильтр»;
      // if already open clicking once more is fine — we then scan ALL selects.
      const filterBtn = page.getByRole('button', { name: 'Фильтр', exact: true }).first();
      if (await filterBtn.isVisible().catch(() => false)) {
        await filterBtn.click().catch(() => {});
        await page.waitForTimeout(700);
        // if a boolean select still isn't in the DOM, the click may have CLOSED
        // an already-open panel — toggle back open.
        const present = await page.evaluate(() =>
          [...document.querySelectorAll('select')].some((s) =>
            [...s.options].map((o) => (o.textContent || '').trim()).join('|').match(/Нет\|Да|—\|✓/),
          ),
        );
        if (!present) {
          await filterBtn.click().catch(() => {});
          await page.waitForTimeout(700);
        }
      }
      // scan EVERY select for the boolean yes/no pattern (testid-independent):
      // PASS if a ["", "Нет", "Да"] select exists and NO ["", "—", "✓"] remains.
      const scan = await page.evaluate(() => {
        const sigs = [...document.querySelectorAll('select')].map((s) =>
          [...s.options].map((o) => (o.textContent || '').trim()).join('|'),
        );
        return {
          hasNetDa: sigs.some((x) => x === '|Нет|Да'),
          hasDash: sigs.some((x) => x === '|—|✓'),
        };
      });
      out.pages[slug] = scan.hasNetDa && !scan.hasDash ? ['', 'Нет', 'Да'] : scan;
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
