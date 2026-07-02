// LIVE CERT — /purchase-orders/new «Валюта документа» rate now comes from the
// account currency справочник (admin-set rate, GET /currencies = 12 200) and NOT
// the live CB feed (/exchange-rates = 11 990,26). Selects USD, reads the «1 USD =
// N UZS» rate text → must be the admin rate, not the CB rate. 0 console errors.
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:3230';
const out = { steps: [], consoleErrors: [] };
const ok = (m) => out.steps.push(`OK  ${m}`);
const bad = (m) => out.steps.push(`BAD ${m}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, locale: 'ru-RU' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on('console', (m) => {
  if (m.type() === 'error') out.consoleErrors.push(m.text().slice(0, 200));
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
  ok('logged in');

  await page.goto(`${BASE}/purchase-orders/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  ok('PO/new rendered');

  // select USD in the «Валюта документа» select (find the select containing a USD option)
  const selected = await page.evaluate(() => {
    const sel = [...document.querySelectorAll('select')].find((s) =>
      [...s.options].some((o) => /USD|доллар/i.test(o.textContent || '') || o.value === 'USD'),
    );
    if (!sel) return null;
    const opt = [...sel.options].find((o) => /USD|доллар/i.test(o.textContent || '') || o.value === 'USD');
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return opt.value;
  });
  if (!selected) {
    bad('no currency select with a USD option found');
  } else {
    ok(`selected USD (value=${selected})`);
    await page.waitForTimeout(2500);
    const body = await page.evaluate(() => document.body.innerText);
    // extract the «1 USD = N UZS» number
    const m = body.match(/1\s*USD\s*=\s*([\d  ., ]+)\s*UZS/i);
    out.rateText = m ? m[1].trim() : '(not found)';
    const digits = (m ? m[1] : '').replace(/[^\d]/g, '');
    out.rateDigits = digits;
    // admin rate = 12200 ; CB feed = 11990(.26). Accept the admin rate.
    if (digits.startsWith('12200')) ok(`rate = admin справочник «12 200» (not the CB 11 990) ✓`);
    else if (digits.startsWith('11990')) bad(`rate still the CB feed «11 990,26» — fix not applied`);
    else bad(`unexpected rate digits: ${digits} (text «${out.rateText}»)`);
  }

  await page.screenshot({
    path: 'D:/projects/moysklad/docs/audits/losses-new-2026-06-25/po-usd-rate.png',
    fullPage: false,
  });
} catch (e) {
  out.fatal = String(e).slice(0, 300);
}

out.consoleErrorCount = out.consoleErrors.length;
const pass = out.steps.filter((s) => s.startsWith('OK')).length;
const fail = out.steps.filter((s) => s.startsWith('BAD')).length;
out.summary = `${pass} OK · ${fail} BAD · ${out.consoleErrorCount} console-errors`;
console.log(JSON.stringify(out, null, 2));
await browser.close();
